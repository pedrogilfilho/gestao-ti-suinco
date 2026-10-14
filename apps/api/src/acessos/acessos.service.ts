import { Injectable } from '@nestjs/common';
import { NOMES_PAPEL, permissoesEfetivas, type AcessoEdicao, type AcessoNovo, type GrupoEntrada, type Papel } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { EventosService } from '../comum/eventos';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { ehDono, gerarHash, senhaTemporaria } from '../auth/senha';
import type { Usuario } from '../auth/decorators';

const ORDEM: Record<Papel, number> = { master: 0, tic: 1, solicitante: 2, consulta: 3 };

@Injectable()
export class AcessosService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  async listar() {
    const as = await this.db.acesso.findMany({
      where: { pessoa: { excluidoEm: null } },
      include: { pessoa: { include: { setor: { select: { nome: true } } } }, grupo: true, credencial: { select: { trocarNoProximoLogin: true } } },
    });
    const itens = as.map((a) => {
      const dono = ehDono(a.pessoa.email);
      return {
        id: a.id, papel: a.papel, nomePapel: a.grupo ? a.grupo.nome : NOMES_PAPEL[a.papel], dono,
        pessoa: { id: a.pessoa.id, nome: a.pessoa.nome, email: a.pessoa.email, setor: a.pessoa.setor.nome },
        grupo: a.grupo && { id: a.grupo.id, nome: a.grupo.nome },
        permissoesMarcadas: a.permissoes,
        permissoes: [...permissoesEfetivas({ papel: a.papel, dono, permissoes: a.permissoes as never, grupo: a.grupo ? { permissoes: a.grupo.permissoes as never } : null })].sort(),
        suspenso: a.suspenso, ultimoLoginEm: a.ultimoLoginEm, criadoEm: a.criadoEm,
        aguardandoPrimeiroLogin: !a.ultimoLoginEm || !!a.credencial?.trocarNoProximoLogin,
      };
    });
    itens.sort((x, y) => ORDEM[x.papel] - ORDEM[y.papel] || x.pessoa.nome.localeCompare(y.pessoa.nome, 'pt-BR'));
    return { itens };
  }

  private async alvo(u: Usuario, id: string) {
    const a = await this.db.acesso.findUnique({ where: { id }, include: { pessoa: true } });
    if (!a) throw new ErroNegocio(404, 'Acesso não encontrado.');
    if (ehDono(a.pessoa.email) && !u.dono) throw new ErroNegocio(403, 'O acesso do dono do app só pode ser alterado por um dono.');
    return a;
  }

  private async grupoValido(grupoId: string | null | undefined) {
    if (grupoId && !(await this.db.grupoAcesso.findUnique({ where: { id: grupoId } }))) throw new ErroNegocio(400, 'Grupo não encontrado.', 'grupoId');
  }

  async criar(u: Usuario, d: AcessoNovo) {
    const p = await this.db.pessoa.findFirst({ where: { id: d.pessoaId, excluidoEm: null }, include: { acesso: true } });
    if (!p) throw new ErroNegocio(400, 'Escolha a pessoa.', 'pessoaId');
    if (p.acesso) throw new ErroNegocio(409, 'Essa pessoa já tem acesso.', 'pessoaId');
    if (ehDono(p.email) && !u.dono) throw new ErroNegocio(403, 'O acesso do dono do app só pode ser alterado por um dono.');
    await this.grupoValido(d.grupoId);
    const senha = senhaTemporaria(), senhaHash = await gerarHash(senha);
    const a = await this.db.$transaction(async (tx) => {
      const a = await tx.acesso.create({ data: { pessoaId: d.pessoaId, papel: d.papel, grupoId: d.grupoId ?? null, permissoes: d.permissoes } });
      await tx.credencialLocal.create({ data: { acessoId: a.id, senhaHash, trocarNoProximoLogin: true } });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'acessos', itemId: a.id, depois: a });
      return a;
    });
    this.eventos.emitir('mudou', { area: 'acessos' });
    return { id: a.id, senhaTemporaria: senha };
  }

  async editar(u: Usuario, id: string, d: AcessoEdicao) {
    const antes = await this.alvo(u, id);
    await this.grupoValido(d.grupoId);
    const { pessoa, ...semPessoa } = antes;
    await this.db.$transaction(async (tx) => {
      const a = await tx.acesso.update({
        where: { id },
        data: { ...(d.papel && { papel: d.papel }), ...(d.grupoId !== undefined && { grupoId: d.grupoId }), ...(d.permissoes && { permissoes: d.permissoes }) },
      });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'acessos', itemId: id, antes: semPessoa, depois: a });
    });
    this.eventos.emitir('mudou', { area: 'acessos' });
    return { ok: true };
  }

  async suspender(u: Usuario, id: string, suspenso: boolean) {
    const a = await this.alvo(u, id);
    if (suspenso && a.id === u.acessoId) throw new ErroNegocio(400, 'Você não pode suspender o próprio acesso.');
    await this.db.$transaction(async (tx) => {
      await tx.acesso.update({ where: { id }, data: { suspenso, ...(suspenso && { revogadoEm: new Date() }) } });
      await auditar(tx, { atorId: u.acessoId, acao: suspenso ? 'suspender' : 'reativar', area: 'acessos', itemId: id });
    });
    if (suspenso) this.eventos.emitir('acesso.derrubado', { acessoId: id });
    this.eventos.emitir('mudou', { area: 'acessos' });
    return { ok: true };
  }

  async forcarLogout(u: Usuario, id: string) {
    await this.alvo(u, id);
    await this.db.$transaction(async (tx) => {
      await tx.acesso.update({ where: { id }, data: { revogadoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'forcar_logout', area: 'acessos', itemId: id });
    });
    this.eventos.emitir('acesso.derrubado', { acessoId: id });
    return { ok: true };
  }

  async senhaTemporaria(u: Usuario, id: string) {
    await this.alvo(u, id);
    const senha = senhaTemporaria(), senhaHash = await gerarHash(senha);
    await this.db.$transaction(async (tx) => {
      await tx.credencialLocal.upsert({
        where: { acessoId: id },
        create: { acessoId: id, senhaHash, trocarNoProximoLogin: true },
        update: { senhaHash, trocarNoProximoLogin: true },
      });
      await tx.acesso.update({ where: { id }, data: { revogadoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'senha', area: 'acessos', itemId: id });
    });
    this.eventos.emitir('acesso.derrubado', { acessoId: id });
    return { senhaTemporaria: senha };
  }

  // Remove o acesso (a pessoa continua cadastrada). Acesso não tem exclusão lógica.
  async excluir(u: Usuario, id: string) {
    const a = await this.alvo(u, id);
    if (ehDono(a.pessoa.email)) throw new ErroNegocio(403, 'O acesso do dono do app não pode ser removido.');
    const { pessoa, ...antes } = a;
    await this.db.$transaction(async (tx) => {
      await tx.acesso.delete({ where: { id } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'acessos', itemId: id, antes: { ...antes, email: pessoa.email } });
    });
    this.eventos.emitir('acesso.derrubado', { acessoId: id });
    this.eventos.emitir('mudou', { area: 'acessos' });
    return { ok: true };
  }

  // ---------- grupos ----------
  async listarGrupos() {
    const gs = await this.db.grupoAcesso.findMany({ orderBy: { nome: 'asc' }, include: { _count: { select: { acessos: true } } } });
    return { itens: gs.map((g) => ({ id: g.id, nome: g.nome, permissoes: g.permissoes, pessoas: g._count.acessos })) };
  }

  private async nomeGrupoLivre(nome: string, ignorar?: string) {
    if (await this.db.grupoAcesso.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, id: ignorar ? { not: ignorar } : undefined } }))
      throw new ErroNegocio(409, 'Já existe um grupo com esse nome.', 'nome');
  }

  async criarGrupo(u: Usuario, d: GrupoEntrada) {
    await this.nomeGrupoLivre(d.nome);
    return this.db.$transaction(async (tx) => {
      const g = await tx.grupoAcesso.create({ data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'grupos', itemId: g.id, depois: g });
      return g;
    });
  }

  async editarGrupo(u: Usuario, id: string, d: GrupoEntrada) {
    const antes = await this.db.grupoAcesso.findUnique({ where: { id } });
    if (!antes) throw new ErroNegocio(404, 'Grupo não encontrado.');
    await this.nomeGrupoLivre(d.nome, id);
    const g = await this.db.$transaction(async (tx) => {
      const g = await tx.grupoAcesso.update({ where: { id }, data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'grupos', itemId: id, antes, depois: g });
      return g;
    });
    this.eventos.emitir('mudou', { area: 'acessos' });
    return g;
  }

  async excluirGrupo(u: Usuario, id: string) {
    const g = await this.db.grupoAcesso.findUnique({ where: { id }, include: { _count: { select: { acessos: true } } } });
    if (!g) throw new ErroNegocio(404, 'Grupo não encontrado.');
    if (g._count.acessos) throw new ErroNegocio(409, 'Tire as pessoas do grupo antes de excluir.');
    const { _count, ...antes } = g;
    await this.db.$transaction(async (tx) => {
      await tx.grupoAcesso.delete({ where: { id } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'grupos', itemId: id, antes });
    });
    return { ok: true };
  }
}
