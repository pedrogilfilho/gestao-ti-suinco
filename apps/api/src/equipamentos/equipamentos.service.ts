import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { equipamentoSchema, situacaoEquipamento, type EquipamentoEntrada } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { EventosService } from '../comum/eventos';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { paginar, termos } from '../comum/lista';
import { idsPorTelefone } from '../comum/telefone';
import { ocupacaoDosEmprestaveis } from '../reservas/ocupacao';
import { lerConfig } from '../comum/config-ler';
import type { Usuario } from '../auth/decorators';

const ABERTO = { devolvidoEm: null, excluidoEm: null } satisfies Prisma.EmprestimoWhereInput;
const SEM_VINCULO = { pessoaId: null, vinculoLivre: '' } satisfies Prisma.EquipamentoWhereInput;

// filtro de "Situação" feito no banco (mesma ordem de situacaoEquipamento)
const FILTRO_SITUACAO: Record<string, Prisma.EquipamentoWhereInput> = {
  baixado: { situacao: 'baixado' }, danificado: { situacao: 'danificado' }, extraviado: { situacao: 'extraviado' }, manut: { situacao: 'manutencao' },
  atrib: { situacao: 'ativo', NOT: SEM_VINCULO },
  estoque: { situacao: 'ativo', ...SEM_VINCULO, somenteCadastro: true },
  fora: { situacao: 'ativo', ...SEM_VINCULO, somenteCadastro: false, emprestimos: { some: ABERTO } },
  livre: { situacao: 'ativo', ...SEM_VINCULO, somenteCadastro: false, emprestimos: { none: ABERTO } },
};

const INCLUIR = {
  pessoa: { select: { id: true, nome: true, email: true } },
  setor: { select: { id: true, nome: true } },
  emprestimos: { where: ABERTO, select: { id: true, previsaoEm: true, pessoa: { select: { id: true, nome: true } } } },
  // módulo 2: as reservas ativas mais à frente (a próxima que ainda não passou é escolhida em paraTela)
  reservas: {
    where: { status: 'ativa', excluidoEm: null }, orderBy: { inicioEm: 'desc' }, take: 10,
    select: { inicioEm: true, fimEm: true, pessoa: { select: { nome: true } } },
  },
} satisfies Prisma.EquipamentoInclude;
type EquipCompleto = Prisma.EquipamentoGetPayload<{ include: typeof INCLUIR }>;

const paraTela = ({ emprestimos, reservas, ...e }: EquipCompleto) => {
  const aberto = emprestimos[0] ?? null;
  const prox = reservas.filter((r) => r.fimEm > new Date()).at(-1) ?? null;
  return {
    proximaReserva: prox && { pessoaNome: prox.pessoa.nome, inicioEm: prox.inicioEm },
    ...e, situacaoExibida: situacaoEquipamento(e, !!aberto),
    emprestimoAberto: aberto && { id: aberto.id, pessoaId: aberto.pessoa.id, pessoaNome: aberto.pessoa.nome, previsaoEm: aberto.previsaoEm },
  };
};

@Injectable()
export class EquipamentosService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  async listar(f: { q: string; tipo?: string; situacao?: string; setorId?: string; pessoaId?: string; cursor?: string; limite: number }) {
    const porTermo = await Promise.all(termos(f.q).map(async (t): Promise<Prisma.EquipamentoWhereInput> => {
      const tel = await idsPorTelefone(this.db, 'equipamento', t);
      return {
        OR: [
          ...(['codigo', 'modelo', 'patrimonio', 'serie', 'ip', 'mac', 'numeroCorp', 'numeroPart', 'obs', 'vinculoLivre', 'tipo'] as const)
            .map((c) => ({ [c]: { contains: t, mode: 'insensitive' as const } })),
          { pessoa: { nome: { contains: t, mode: 'insensitive' } } },
          ...(tel.length ? [{ id: { in: tel } }] : []),
        ],
      };
    }));
    const itens = await this.db.equipamento.findMany({
      where: {
        excluidoEm: null, tipo: f.tipo || undefined, setorId: f.setorId || undefined, pessoaId: f.pessoaId || undefined,
        AND: [...porTermo, ...(f.situacao && FILTRO_SITUACAO[f.situacao] ? [FILTRO_SITUACAO[f.situacao]!] : [])],
      },
      include: INCLUIR, orderBy: [{ codigo: 'asc' }, { id: 'asc' }], take: f.limite + 1,
      ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    const pg = paginar(itens, f.limite);
    return { itens: pg.itens.map(paraTela), proximo: pg.proximo };
  }

  async obter(id: string) {
    const e = await this.db.equipamento.findFirst({ where: { id, excluidoEm: null }, include: INCLUIR });
    if (!e) throw new ErroNegocio(404, 'Equipamento não encontrado.');
    return paraTela(e);
  }

  async ocupacao(a: Date, b: Date, ignorarReserva?: string) {
    return ocupacaoDosEmprestaveis(this.db, await lerConfig(this.db), a, b, ignorarReserva);
  }

  async livresParaEmprestimo() {
    const cfg = await lerConfig(this.db);
    return this.db.equipamento.findMany({
      where: { excluidoEm: null, tipo: { in: cfg.tiposEmprestaveis }, ...FILTRO_SITUACAO.livre },
      select: { id: true, codigo: true, tipo: true, modelo: true, patrimonio: true }, orderBy: { codigo: 'asc' },
    });
  }

  private async conferir(d: EquipamentoEntrada, ignorar?: string) {
    const outro = { excluidoEm: null, id: ignorar ? { not: ignorar } : undefined };
    if (await this.db.equipamento.findFirst({ where: { ...outro, codigo: { equals: d.codigo, mode: 'insensitive' } } }))
      throw new ErroNegocio(409, 'Já existe equipamento com esse Nome.', 'codigo');
    if (d.ipTipo === 'fixo' && d.ip) {
      const ip = await this.db.equipamento.findFirst({ where: { ...outro, ipTipo: 'fixo', ip: d.ip } });
      if (ip) throw new ErroNegocio(409, `Esse IP já está em ${ip.codigo}.`, 'ip');
    }
    if (d.pessoaId && !(await this.db.pessoa.findFirst({ where: { id: d.pessoaId, excluidoEm: null } })))
      throw new ErroNegocio(400, 'Escolha um colaborador cadastrado.', 'pessoaId');
    if (d.setorId && !(await this.db.setor.findFirst({ where: { id: d.setorId, excluidoEm: null } })))
      throw new ErroNegocio(400, 'Escolha um setor cadastrado.', 'setorId');
  }

  private dados(d: EquipamentoEntrada, antes?: { pessoaId: string | null; vinculoLivre: string; vinculadoEm: Date | null }) {
    const temVinculo = !!d.pessoaId || !!d.vinculoLivre;
    const mesmo = antes && antes.pessoaId === (d.pessoaId ?? null) && antes.vinculoLivre === d.vinculoLivre;
    const vinculadoEm = !temVinculo ? null : mesmo ? antes!.vinculadoEm : new Date();
    return {
      ...d, ip: d.ipTipo === 'fixo' ? d.ip! : null, mac: d.mac || null, ipTipo: d.ipTipo ?? null,
      numeroCorp: d.numeroCorp ?? null, numeroPart: d.numeroPart ?? null, setorId: d.setorId ?? null, vinculadoEm,
    };
  }

  async criar(u: Usuario, d: EquipamentoEntrada) {
    await this.conferir(d);
    const e = await this.db.$transaction(async (tx) => {
      const e = await tx.equipamento.create({ data: this.dados(d) });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'equipamentos', itemId: e.id, depois: e });
      return e;
    });
    this.eventos.emitir('mudou', { area: 'equipamentos' });
    return e;
  }

  async editar(u: Usuario, id: string, d: EquipamentoEntrada) {
    const antes = await this.db.equipamento.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Equipamento não encontrado.');
    await this.conferir(d, id);
    const e = await this.db.$transaction(async (tx) => {
      const e = await tx.equipamento.update({ where: { id }, data: this.dados(d, antes) });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'equipamentos', itemId: id, antes, depois: e });
      return e;
    });
    this.eventos.emitir('mudou', { area: 'equipamentos' });
    return e;
  }

  // Vincular/soltar sem mandar o cadastro inteiro (usado em Editar usuário).
  async vincular(u: Usuario, id: string, pessoaId: string | null) {
    const antes = await this.db.equipamento.findFirst({ where: { id, excluidoEm: null }, include: { emprestimos: { where: ABERTO } } });
    if (!antes) throw new ErroNegocio(404, 'Equipamento não encontrado.');
    if (pessoaId && antes.emprestimos.length) throw new ErroNegocio(409, `${antes.codigo} está emprestado. Registre a devolução antes de vincular.`);
    if (pessoaId && !(await this.db.pessoa.findFirst({ where: { id: pessoaId, excluidoEm: null } })))
      throw new ErroNegocio(400, 'Escolha um colaborador cadastrado.', 'pessoaId');
    const { emprestimos, ...semEmp } = antes;
    await this.db.$transaction(async (tx) => {
      const e = await tx.equipamento.update({ where: { id }, data: { pessoaId, vinculoLivre: '', vinculadoEm: pessoaId ? new Date() : null } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'equipamentos', itemId: id, antes: semEmp, depois: e });
    });
    this.eventos.emitir('mudou', { area: 'equipamentos', pessoaIds: [antes.pessoaId, pessoaId].filter((x): x is string => !!x) });
    return { ok: true };
  }

  async excluir(u: Usuario, id: string) {
    const e = await this.db.equipamento.findFirst({ where: { id, excluidoEm: null }, include: { emprestimos: { where: ABERTO } } });
    if (!e) throw new ErroNegocio(404, 'Equipamento não encontrado.');
    if (e.emprestimos.length) throw new ErroNegocio(409, `${e.codigo} está emprestado. Registre a devolução antes de excluir.`);
    const { emprestimos, ...antes } = e;
    await this.db.$transaction(async (tx) => {
      await tx.equipamento.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'equipamentos', itemId: id, antes });
    });
    this.eventos.emitir('mudou', { area: 'equipamentos' });
    return { ok: true };
  }

  async lote(u: Usuario, linhas: unknown[]) {
    const erros: { linha: number; mensagem: string }[] = [];
    const vistos = new Map<string, number>();
    let criados = 0;
    for (const [i, bruta] of linhas.entries()) {
      const linha = i + 1;
      const r = equipamentoSchema.safeParse(bruta);
      if (!r.success) { erros.push({ linha, mensagem: r.error.issues[0]!.message }); continue; }
      const chave = r.data.codigo.toLowerCase(), antes = vistos.get(chave);
      if (antes) { erros.push({ linha, mensagem: `Nome repetido na lista (linha ${antes}).` }); continue; }
      vistos.set(chave, linha);
      try {
        await this.criar(u, r.data);
        criados++;
      } catch (e) {
        erros.push({ linha, mensagem: e instanceof ErroNegocio ? e.mensagem : 'Erro ao gravar.' });
      }
    }
    return { criados, erros };
  }
}
