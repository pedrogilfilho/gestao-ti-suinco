import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { chaveNome, pessoaLinhaSchema, type PessoaEntrada, type PessoaEdicao } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { ArquivosService } from '../comum/arquivos.service';
import { EventosService } from '../comum/eventos';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { paginar, termos } from '../comum/lista';
import { idsPorTelefone } from '../comum/telefone';
import { gerarHash, senhaTemporaria } from '../auth/senha';
import type { Usuario } from '../auth/decorators';

const INCLUIR = {
  setor: { select: { id: true, nome: true } },
  acesso: { select: { id: true, papel: true } },
  equipamentos: { where: { excluidoEm: null }, select: { id: true, codigo: true, tipo: true }, orderBy: { codigo: 'asc' as const } },
  emprestimos: { where: { devolvidoEm: null, excluidoEm: null }, select: { id: true, equipamento: { select: { codigo: true } } } },
} satisfies Prisma.PessoaInclude;
type PessoaCompleta = Prisma.PessoaGetPayload<{ include: typeof INCLUIR }>;

const motivoTrava = (p: PessoaCompleta): string | null => {
  if (p.emprestimos.length) return `${p.nome} está com ${p.emprestimos.map((e) => e.equipamento.codigo).join(', ')} emprestado. Registre a devolução antes de excluir.`;
  if (p.equipamentos.length) return `${p.nome} está com ${p.equipamentos.map((e) => e.codigo).join(', ')} vinculado. Desvincule antes de excluir.`;
  return null;
};

// O que a tela recebe: sem os caminhos de arquivo; só se há assinatura/foto.
const paraTela = (p: PessoaCompleta) => {
  const { assinaturaUrl, fotoUrl, emprestimos, ...resto } = p;
  return { ...resto, temAssinatura: !!assinaturaUrl, temFoto: !!fotoUrl, tecnico: !!p.acesso && ['tic', 'master'].includes(p.acesso.papel), exclusaoTravada: motivoTrava(p) };
};

@Injectable()
export class PessoasService {
  constructor(private db: PrismaService, private arquivos: ArquivosService, private eventos: EventosService) {}

  async listar(f: { q: string; setorId?: string; ativo?: string; tecnico?: string; cursor?: string; limite: number }) {
    const ts = termos(f.q);
    const porTermo = await Promise.all(ts.map(async (t): Promise<Prisma.PessoaWhereInput> => {
      const tel = await idsPorTelefone(this.db, 'pessoa', t);
      return {
        OR: [
          { nome: { contains: t, mode: 'insensitive' } }, { email: { contains: t, mode: 'insensitive' } },
          { login: { contains: t, mode: 'insensitive' } }, { telefoneCorp: { contains: t } }, { telefonePart: { contains: t } },
          { setor: { nome: { contains: t, mode: 'insensitive' } } },
          ...(tel.length ? [{ id: { in: tel } }] : []),
        ],
      };
    }));
    const itens = await this.db.pessoa.findMany({
      where: {
        excluidoEm: null, setorId: f.setorId || undefined,
        ativo: f.ativo === 'sim' ? true : f.ativo === 'nao' ? false : undefined,
        // técnico da TI = tem acesso tic ou master
        ...(f.tecnico === 'sim' && { acesso: { papel: { in: ['tic', 'master'] } } }),
        ...(f.tecnico === 'nao' && { NOT: { acesso: { papel: { in: ['tic', 'master'] } } } }),
        AND: porTermo,
      },
      include: INCLUIR, orderBy: [{ nome: 'asc' }, { id: 'asc' }], take: f.limite + 1,
      ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    const pg = paginar(itens, f.limite);
    return { itens: pg.itens.map(paraTela), proximo: pg.proximo };
  }

  async obter(id: string) {
    const p = await this.db.pessoa.findFirst({ where: { id, excluidoEm: null }, include: INCLUIR });
    if (!p) throw new ErroNegocio(404, 'Usuário não encontrado.');
    return paraTela(p);
  }

  private async setorValido(id: string) {
    if (!(await this.db.setor.findFirst({ where: { id, excluidoEm: null } }))) throw new ErroNegocio(400, 'Selecione o setor.', 'setorId');
  }

  private async ehTecnico(pessoaId: string) {
    return !!(await this.db.acesso.findFirst({ where: { pessoaId, papel: { in: ['tic', 'master'] } } }));
  }

  async criar(u: Usuario, d: PessoaEntrada) {
    await this.setorValido(d.setorId);
    if (await this.db.pessoa.findFirst({ where: { email: d.email, excluidoEm: null } }))
      throw new ErroNegocio(409, 'Já existe usuário com esse e-mail.', 'email');
    if (d.assinatura) throw new ErroNegocio(400, 'Só técnicos da TI têm assinatura salva.', 'assinatura');
    const fotoUrl = d.foto ? await this.arquivos.salvarFoto(d.foto) : null;
    const { assinatura, apagarAssinatura, foto, apagarFoto, ...dados } = d;
    const p = await this.db.$transaction(async (tx) => {
      const p = await tx.pessoa.create({ data: { ...dados, fotoUrl } });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'pessoas', itemId: p.id, depois: p });
      return p;
    });
    this.eventos.emitir('mudou', { area: 'pessoas' });
    return p;
  }

  async editar(u: Usuario, id: string, d: PessoaEdicao) {
    const antes = await this.db.pessoa.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Usuário não encontrado.');
    await this.setorValido(d.setorId);
    if (d.assinatura && !(await this.ehTecnico(id))) throw new ErroNegocio(400, 'Só técnicos da TI têm assinatura salva.', 'assinatura');
    const assinaturaUrl = d.assinatura ? await this.arquivos.salvarPng(d.assinatura, 'assinaturas') : d.apagarAssinatura ? null : antes.assinaturaUrl;
    const fotoUrl = d.foto ? await this.arquivos.salvarFoto(d.foto) : d.apagarFoto ? null : antes.fotoUrl;
    const { assinatura, apagarAssinatura, foto, apagarFoto, limites, ...dados } = d;
    const p = await this.db.$transaction(async (tx) => {
      const p = await tx.pessoa.update({ where: { id }, data: { ...dados, assinaturaUrl, fotoUrl, ...(limites && { limites }) } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pessoas', itemId: id, antes, depois: p });
      return p;
    });
    this.eventos.emitir('mudou', { area: 'pessoas', pessoaIds: [id] });
    return p;
  }

  async minhaFoto(u: Usuario, d: { foto?: string; apagarFoto?: boolean }) {
    const antes = await this.db.pessoa.findUniqueOrThrow({ where: { id: u.pessoaId } });
    const fotoUrl = d.foto ? await this.arquivos.salvarFoto(d.foto) : d.apagarFoto ? null : antes.fotoUrl;
    await this.db.$transaction(async (tx) => {
      await tx.pessoa.update({ where: { id: u.pessoaId }, data: { fotoUrl } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pessoas', itemId: u.pessoaId, antes: { fotoUrl: antes.fotoUrl }, depois: { fotoUrl } });
    });
    return { ok: true };
  }

  async caminhoFoto(u: Usuario, id: string): Promise<string> {
    if (id !== u.pessoaId && !u.equipeTI) throw new ErroNegocio(403, 'Você não tem permissão para ver isso.');
    const p = await this.db.pessoa.findFirst({ where: { id, excluidoEm: null }, select: { fotoUrl: true } });
    if (!p?.fotoUrl) throw new ErroNegocio(404, 'Sem foto.');
    return this.arquivos.caminho(p.fotoUrl);
  }

  async caminhoAssinatura(id: string): Promise<string> {
    const p = await this.db.pessoa.findFirst({ where: { id, excluidoEm: null }, select: { assinaturaUrl: true } });
    if (!p?.assinaturaUrl) throw new ErroNegocio(404, 'Sem assinatura.');
    return this.arquivos.caminho(p.assinaturaUrl);
  }

  async excluir(u: Usuario, id: string) {
    const p = await this.db.pessoa.findFirst({ where: { id, excluidoEm: null }, include: INCLUIR });
    if (!p) throw new ErroNegocio(404, 'Usuário não encontrado.');
    const motivo = motivoTrava(p);
    if (motivo) throw new ErroNegocio(409, motivo);
    await this.db.$transaction(async (tx) => {
      await tx.pessoa.update({ where: { id }, data: { excluidoEm: new Date() } });
      await tx.acesso.updateMany({ where: { pessoaId: id }, data: { suspenso: true, revogadoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'pessoas', itemId: id, antes: p });
    });
    if (p.acesso) this.eventos.emitir('acesso.derrubado', { acessoId: p.acesso.id });
    this.eventos.emitir('mudou', { area: 'pessoas' });
    return { ok: true };
  }

  // Desativar ≠ excluir: a pessoa continua cadastrada; os equipamentos vinculados a ela voltam ao estoque.
  async desativar(u: Usuario, ids: string[]) {
    await this.db.$transaction(async (tx) => {
      for (const id of ids) {
        const soltos = await tx.equipamento.findMany({ where: { pessoaId: id, excluidoEm: null }, select: { id: true, codigo: true } });
        await tx.equipamento.updateMany({ where: { pessoaId: id }, data: { pessoaId: null, vinculadoEm: null } });
        await tx.pessoa.update({ where: { id }, data: { ativo: false } });
        await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pessoas', itemId: id, depois: { ativo: false, equipamentosSoltos: soltos.map((e) => e.codigo) } });
      }
    });
    this.eventos.emitir('mudou', { area: 'pessoas', pessoaIds: ids });
    this.eventos.emitir('mudou', { area: 'equipamentos' });
    return { ok: true };
  }

  async reativar(u: Usuario, id: string) {
    await this.db.$transaction(async (tx) => {
      await tx.pessoa.update({ where: { id }, data: { ativo: true } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pessoas', itemId: id, depois: { ativo: true } });
    });
    this.eventos.emitir('mudou', { area: 'pessoas', pessoaIds: [id] });
    return { ok: true };
  }

  // "Colar lista": email;nome;setor;perfil, validada linha por linha.
  async lote(u: Usuario, linhas: unknown[]) {
    const setores = await this.db.setor.findMany({ where: { excluidoEm: null }, select: { id: true, nome: true } });
    const setorPorChave = new Map(setores.map((s) => [chaveNome(s.nome), s.id]));
    const vistos = new Map<string, number>();
    const erros: { linha: number; mensagem: string }[] = [], senhas: { email: string; senha: string }[] = [];
    let criados = 0;
    for (const [i, bruta] of linhas.entries()) {
      const linha = i + 1;
      const r = pessoaLinhaSchema.safeParse(bruta);
      if (!r.success) { erros.push({ linha, mensagem: r.error.issues[0]!.message }); continue; }
      const d = r.data;
      const antes = vistos.get(d.email);
      if (antes) { erros.push({ linha, mensagem: `E-mail repetido na lista (linha ${antes}).` }); continue; }
      vistos.set(d.email, linha);
      const setorId = setorPorChave.get(chaveNome(d.setor));
      if (!setorId) { erros.push({ linha, mensagem: `Setor "${d.setor}" não está cadastrado. Cadastre o setor primeiro.` }); continue; }
      if (await this.db.pessoa.findFirst({ where: { email: d.email, excluidoEm: null } })) { erros.push({ linha, mensagem: 'Já estava cadastrado.' }); continue; }
      const aplicarPerfil = d.perfil && u.permissoes.has('acessos');
      const senha = aplicarPerfil ? senhaTemporaria() : '';
      const senhaHash = aplicarPerfil ? await gerarHash(senha) : '';
      await this.db.$transaction(async (tx) => {
        const p = await tx.pessoa.create({ data: { nome: d.nome, email: d.email, setorId } });
        await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'pessoas', itemId: p.id, depois: p });
        if (aplicarPerfil) {
          const a = await tx.acesso.create({ data: { pessoaId: p.id, papel: d.perfil!, permissoes: {} } });
          await tx.credencialLocal.create({ data: { acessoId: a.id, senhaHash, trocarNoProximoLogin: true } });
          await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'acessos', itemId: a.id, depois: a });
        }
      });
      if (aplicarPerfil) senhas.push({ email: d.email, senha });
      criados++;
    }
    if (criados) this.eventos.emitir('mudou', { area: 'pessoas' });
    return senhas.length ? { criados, erros, senhas } : { criados, erros };
  }
}
