import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  limiteDe, situacaoEmprestimo, situacaoEquipamento,
  type ConfigNucleo, type Devolucao, type EmprestimoEdicao, type EmprestimoNovo, type Resolver, type Situacao,
} from '@gestao/shared';
import { PrismaService, type Tx } from '../comum/prisma.service';
import { ArquivosService } from '../comum/arquivos.service';
import { EventosService } from '../comum/eventos';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { paginar, termos } from '../comum/lista';
import { lerConfig } from '../comum/config-ler';
import { ehDono } from '../auth/senha';
import type { Usuario } from '../auth/decorators';

const ABERTO = { devolvidoEm: null, excluidoEm: null } satisfies Prisma.EmprestimoWhereInput;
const INCLUIR = {
  equipamento: { select: { id: true, codigo: true, tipo: true, modelo: true } },
  pessoa: { select: { id: true, nome: true, email: true, telefoneCorp: true, telefonePart: true, setor: { select: { nome: true } } } },
  tecnico: { select: { id: true, nome: true } },
} satisfies Prisma.EmprestimoInclude;
type EmpCompleto = Prisma.EmprestimoGetPayload<{ include: typeof INCLUIR }>;
const lista = (v: Prisma.JsonValue) => (Array.isArray(v) ? (v as string[]) : []);
const ehConflitoUnico = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export type StatusLista = 'abertos' | 'atrasados' | 'devolvidos' | 'pendencias' | 'todos';

@Injectable()
export class EmprestimosService {
  constructor(private db: PrismaService, private arquivos: ArquivosService, private eventos: EventosService) {}

  private paraTela(e: EmpCompleto, cfg: ConfigNucleo, agora = new Date()) {
    const { assinaturaRetiradaUrl, assinaturaDevolucaoUrl, ...resto } = e;
    const acessoriosFaltando = lista(e.acessoriosFaltando);
    return {
      ...resto,
      pessoa: { ...e.pessoa, setor: e.pessoa.setor.nome },
      acessorios: lista(e.acessorios), acessoriosDevolvidos: lista(e.acessoriosDevolvidos), acessoriosFaltando,
      temAssinaturaRetirada: !!assinaturaRetiradaUrl, temAssinaturaDevolucao: !!assinaturaDevolucaoUrl,
      situacao: situacaoEmprestimo({ devolvidoEm: e.devolvidoEm, acessoriosFaltando, assinaturaDevolucaoUrl, previsaoEm: e.previsaoEm }, agora, cfg.assinaturas),
    };
  }

  private filtroStatus(status: StatusLista, cfg: ConfigNucleo): Prisma.EmprestimoWhereInput {
    const devolvido = { devolvidoEm: { not: null } };
    switch (status) {
      case 'abertos': return { devolvidoEm: null };
      case 'atrasados': return { devolvidoEm: null, previsaoEm: { lt: new Date() } };
      case 'devolvidos': return devolvido;
      case 'pendencias': return {
        ...devolvido,
        OR: [{ NOT: { acessoriosFaltando: { equals: [] } } }, ...(cfg.assinaturas ? [{ assinaturaDevolucaoUrl: null }] : [])],
      };
      default: return {};
    }
  }

  async listar(f: { status: StatusLista; q: string; pessoaId?: string; cursor?: string; limite: number }) {
    const cfg = await lerConfig(this.db);
    const porTermo = termos(f.q).map((t): Prisma.EmprestimoWhereInput => ({
      OR: [
        { equipamento: { codigo: { contains: t, mode: 'insensitive' } } },
        { pessoa: { nome: { contains: t, mode: 'insensitive' } } }, { pessoa: { email: { contains: t, mode: 'insensitive' } } },
        { pessoa: { setor: { nome: { contains: t, mode: 'insensitive' } } } },
        { chamadoGlpi: { contains: t } }, { finalidade: { contains: t, mode: 'insensitive' } },
      ],
    }));
    const abertos = f.status === 'abertos' || f.status === 'atrasados';
    const itens = await this.db.emprestimo.findMany({
      where: { excluidoEm: null, pessoaId: f.pessoaId || undefined, ...this.filtroStatus(f.status, cfg), AND: porTermo },
      include: INCLUIR,
      orderBy: abertos ? [{ previsaoEm: 'asc' }, { id: 'asc' }] : [{ retiradaEm: 'desc' }, { id: 'asc' }],
      take: f.limite + 1, ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    const pg = paginar(itens, f.limite);
    return { itens: pg.itens.map((e) => this.paraTela(e, cfg)), proximo: pg.proximo };
  }

  async obter(id: string) {
    const cfg = await lerConfig(this.db);
    const e = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null }, include: INCLUIR });
    if (!e) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    return this.paraTela(e, cfg);
  }

  // Equipamento pode ser emprestado? (tipo emprestável e situação Disponível)
  private async conferirEquipamento(db: PrismaService | Tx, equipamentoId: string, cfg: ConfigNucleo, ignorarEmp?: string) {
    const eq = await db.equipamento.findFirst({
      where: { id: equipamentoId, excluidoEm: null },
      include: { emprestimos: { where: { ...ABERTO, id: ignorarEmp ? { not: ignorarEmp } : undefined }, select: { id: true } } },
    });
    if (!eq) throw new ErroNegocio(400, 'Escolha o equipamento.', 'equipamentoId');
    if (!cfg.tiposEmprestaveis.includes(eq.tipo as never)) throw new ErroNegocio(409, `${eq.codigo} não é um equipamento de empréstimo.`, 'equipamentoId');
    if (eq.emprestimos.length) throw new ErroNegocio(409, 'Esse equipamento já está emprestado.', 'equipamentoId');
    const sit = situacaoEquipamento(eq, false);
    if (sit.k !== 'livre') throw new ErroNegocio(409, `${eq.codigo} está ${sit.txt.toLowerCase()}.`, 'equipamentoId');
    return eq;
  }

  async registrar(u: Usuario, d: EmprestimoNovo) {
    const cfg = await lerConfig(this.db);
    const pessoa = await this.db.pessoa.findFirst({ where: { id: d.pessoaId, excluidoEm: null } });
    if (!pessoa) throw new ErroNegocio(400, 'Escolha o colaborador.', 'pessoaId');
    if (!pessoa.ativo) throw new ErroNegocio(409, `${pessoa.nome} está desativado.`, 'pessoaId');
    const eq = await this.conferirEquipamento(this.db, d.equipamentoId, cfg);
    if (cfg.assinaturas && !d.assinatura) throw new ErroNegocio(400, 'O colaborador precisa assinar a retirada.', 'assinatura');
    if (d.finalidade !== 'Outra' && !cfg.finalidades.some((f) => f.nome === d.finalidade)) throw new ErroNegocio(400, 'Escolha a finalidade.', 'finalidade');

    const tecnicoId = d.tecnicoId ?? u.pessoaId;
    const tec = await this.db.acesso.findFirst({ where: { pessoaId: tecnicoId, papel: { in: ['tic', 'master'] }, pessoa: { excluidoEm: null } }, include: { pessoa: true } });
    const tecnicoEhDono = tecnicoId === u.pessoaId && ehDono(u.email);
    if (!tec && !tecnicoEhDono) throw new ErroNegocio(400, 'Escolha um técnico da TI.', 'tecnicoId');

    const agora = new Date();
    if (cfg.bloqueioAtraso && !d.confirmarAtraso) {
      const atrasados = await this.db.emprestimo.findMany({ where: { pessoaId: pessoa.id, ...ABERTO, previsaoEm: { lt: agora } }, include: { equipamento: true } });
      if (atrasados.length)
        throw new ErroNegocio(409, `${pessoa.nome} está com equipamento em atraso (${atrasados.map((a) => a.equipamento.codigo).join(', ')}).`, undefined, 'atraso');
    }
    const lim = limiteDe(pessoa.limites, eq.tipo);
    const tem = await this.db.emprestimo.count({ where: { pessoaId: pessoa.id, ...ABERTO, equipamento: { tipo: eq.tipo } } });
    const passouLimite = tem >= lim;
    if (passouLimite) {
      if (!d.liberarLimite) throw new ErroNegocio(409, `${pessoa.nome} já está com ${tem} ${eq.tipo} nesse período (limite: ${lim}).`, undefined, 'limite');
      if (!u.permissoes.has('excluir')) throw new ErroNegocio(403, 'Só o Administrador Master pode liberar essa exceção.');
    }

    const assinaturaRetiradaUrl = d.assinatura ? await this.arquivos.salvarPng(d.assinatura, 'assinaturas') : null;
    try {
      const e = await this.db.$transaction(async (tx) => {
        const e = await tx.emprestimo.create({
          data: {
            equipamentoId: eq.id, pessoaId: pessoa.id, tecnicoId, finalidade: d.finalidade, finalidadeOutra: d.finalidade === 'Outra' ? d.finalidadeOutra : '',
            chamadoGlpi: d.chamadoGlpi, retiradaEm: d.retiradaEm, previsaoEm: d.previsaoEm, acessorios: d.acessorios, assinaturaRetiradaUrl, obs: d.obs,
          },
        });
        await auditar(tx, {
          atorId: u.acessoId, acao: 'criar', area: 'emprestimos', itemId: e.id,
          depois: { ...e, equipamento: eq.codigo, pessoa: pessoa.nome, liberouLimite: passouLimite, confirmouAtraso: !!d.confirmarAtraso },
        });
        return e;
      });
      this.eventos.emitir('mudou', { area: 'emprestimos', pessoaIds: [pessoa.id] });
      return e;
    } catch (err) {
      // dois registros ao mesmo tempo: o índice único deixa passar só um
      if (ehConflitoUnico(err)) throw new ErroNegocio(409, 'Esse equipamento já está emprestado.', 'equipamentoId');
      throw err;
    }
  }

  async editar(u: Usuario, id: string, d: EmprestimoEdicao) {
    const cfg = await lerConfig(this.db);
    const antes = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    if (d.equipamentoId && d.equipamentoId !== antes.equipamentoId) await this.conferirEquipamento(this.db, d.equipamentoId, cfg, id);
    if (d.pessoaId && !(await this.db.pessoa.findFirst({ where: { id: d.pessoaId, excluidoEm: null } }))) throw new ErroNegocio(400, 'Escolha o colaborador.', 'pessoaId');
    const retirada = d.retiradaEm ?? antes.retiradaEm, previsao = d.previsaoEm ?? antes.previsaoEm;
    if (previsao && previsao <= retirada) throw new ErroNegocio(400, 'A previsão de entrega precisa ser depois da retirada.', 'previsaoEm');
    const assinaturaRetiradaUrl = d.assinatura ? await this.arquivos.salvarPng(d.assinatura, 'assinaturas') : undefined;
    const { assinatura, ...campos } = d;
    try {
      const e = await this.db.$transaction(async (tx) => {
        const e = await tx.emprestimo.update({ where: { id }, data: { ...campos, ...(assinaturaRetiradaUrl && { assinaturaRetiradaUrl }) } });
        await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'emprestimos', itemId: id, antes, depois: e });
        return e;
      });
      this.eventos.emitir('mudou', { area: 'emprestimos', pessoaIds: [antes.pessoaId, e.pessoaId] });
      return e;
    } catch (err) {
      if (ehConflitoUnico(err)) throw new ErroNegocio(409, 'Esse equipamento já está emprestado.', 'equipamentoId');
      throw err;
    }
  }

  async devolver(u: Usuario, id: string, d: Devolucao) {
    const cfg = await lerConfig(this.db);
    const e = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null } });
    if (!e) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    if (e.devolvidoEm) throw new ErroNegocio(409, 'Esse empréstimo já foi devolvido.');
    if (cfg.assinaturas && !d.assinatura) throw new ErroNegocio(400, 'O colaborador precisa assinar a devolução.', 'assinatura');
    const levou = lista(e.acessorios);
    const faltando = levou.filter((a) => !d.acessoriosDevolvidos.includes(a));
    const assinaturaDevolucaoUrl = d.assinatura ? await this.arquivos.salvarPng(d.assinatura, 'assinaturas') : null;
    const r = await this.db.$transaction(async (tx) => {
      const n = await tx.emprestimo.update({
        where: { id },
        data: {
          devolvidoEm: d.devolvidoEm ?? new Date(), acessoriosDevolvidos: d.acessoriosDevolvidos.filter((a) => levou.includes(a)),
          acessoriosFaltando: faltando, assinaturaDevolucaoUrl, obsDevolucao: d.obsDevolucao,
        },
      });
      await auditar(tx, { atorId: u.acessoId, acao: 'devolver', area: 'emprestimos', itemId: id, antes: e, depois: n });
      return n;
    });
    this.eventos.emitir('mudou', { area: 'emprestimos', pessoaIds: [e.pessoaId] });
    return r;
  }

  // Resolver pendência: acessórios que chegaram depois e/ou assinatura que faltou.
  async resolver(u: Usuario, id: string, d: Resolver) {
    const e = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null } });
    if (!e) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    const faltando = lista(e.acessoriosFaltando), devolvidos = lista(e.acessoriosDevolvidos);
    const recebidos = d.acessoriosRecebidos.filter((a) => faltando.includes(a));
    const dados: Prisma.EmprestimoUpdateInput = {
      acessoriosFaltando: faltando.filter((a) => !recebidos.includes(a)),
      acessoriosDevolvidos: [...devolvidos, ...recebidos],
    };
    if (d.assinaturaDevolucao && e.devolvidoEm && !e.assinaturaDevolucaoUrl) dados.assinaturaDevolucaoUrl = await this.arquivos.salvarPng(d.assinaturaDevolucao, 'assinaturas');
    if (d.assinaturaRetirada && !e.assinaturaRetiradaUrl) dados.assinaturaRetiradaUrl = await this.arquivos.salvarPng(d.assinaturaRetirada, 'assinaturas');
    const r = await this.db.$transaction(async (tx) => {
      const n = await tx.emprestimo.update({ where: { id }, data: dados });
      await auditar(tx, { atorId: u.acessoId, acao: 'resolver', area: 'emprestimos', itemId: id, antes: e, depois: n });
      return n;
    });
    this.eventos.emitir('mudou', { area: 'emprestimos', pessoaIds: [e.pessoaId] });
    return r;
  }

  async excluir(u: Usuario, id: string) {
    const e = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null } });
    if (!e) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    await this.db.$transaction(async (tx) => {
      await tx.emprestimo.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'emprestimos', itemId: id, antes: e });
    });
    this.eventos.emitir('mudou', { area: 'emprestimos', pessoaIds: [e.pessoaId] });
    return { ok: true };
  }

  // Portal: o que está com a pessoa logada. "Perto de vencer" quando falta menos que o aviso configurado.
  async meus(u: Usuario) {
    const cfg = await lerConfig(this.db);
    const agora = new Date();
    const [emps, vinculados] = await Promise.all([
      this.db.emprestimo.findMany({ where: { pessoaId: u.pessoaId, ...ABERTO }, include: INCLUIR, orderBy: { previsaoEm: 'asc' } }),
      this.db.equipamento.findMany({ where: { pessoaId: u.pessoaId, excluidoEm: null }, select: { id: true, codigo: true, tipo: true, modelo: true }, orderBy: { codigo: 'asc' } }),
    ]);
    const perto = (e: EmpCompleto) => !!e.previsaoEm && e.previsaoEm > agora && e.previsaoEm.getTime() - agora.getTime() <= cfg.avisoMin * 60_000;
    return {
      emprestimos: emps.map((e) => {
        const t = this.paraTela(e, cfg, agora);
        const situacao: Situacao = perto(e) ? { k: 'aberto', txt: 'Perto de vencer', cls: 'warn' } : t.situacao;
        return { id: t.id, equipamento: t.equipamento, retiradaEm: t.retiradaEm, previsaoEm: t.previsaoEm, acessorios: t.acessorios, situacao };
      }),
      vinculados,
    };
  }

  async contadores() {
    const agora = new Date();
    const [atrasados, abertos] = await Promise.all([
      this.db.emprestimo.count({ where: { ...ABERTO, previsaoEm: { lt: agora } } }),
      this.db.emprestimo.count({ where: ABERTO }),
    ]);
    return { atrasados, abertos };
  }

  async caminhoAssinatura(u: Usuario, id: string, qual: 'retirada' | 'devolucao') {
    const e = await this.db.emprestimo.findFirst({ where: { id, excluidoEm: null } });
    if (!e) throw new ErroNegocio(404, 'Empréstimo não encontrado.');
    if (!u.equipeTI && e.pessoaId !== u.pessoaId) throw new ErroNegocio(403, 'Você não tem permissão para ver isso.');
    const url = qual === 'retirada' ? e.assinaturaRetiradaUrl : e.assinaturaDevolucaoUrl;
    if (!url) throw new ErroNegocio(404, 'Sem assinatura.');
    return this.arquivos.caminho(url);
  }
}
