import { Injectable } from '@nestjs/common';
import { chaveNome, type SetorEntrada } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import type { Usuario } from '../auth/decorators';

@Injectable()
export class SetoresService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  async listar() {
    const ss = await this.db.setor.findMany({
      where: { excluidoEm: null },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { pessoas: { where: { excluidoEm: null } }, equipamentos: { where: { excluidoEm: null } } } } },
    });
    return { itens: ss.map((s) => ({ id: s.id, nome: s.nome, pessoas: s._count.pessoas, equipamentos: s._count.equipamentos })) };
  }

  // nome repetido sem diferenciar maiúsculas nem acento (são poucos setores: compara em memória)
  private async nomeLivre(nome: string, ignorar?: string) {
    const ativos = await this.db.setor.findMany({ where: { excluidoEm: null }, select: { id: true, nome: true } });
    if (ativos.some((s) => s.id !== ignorar && chaveNome(s.nome) === chaveNome(nome)))
      throw new ErroNegocio(409, 'Já existe um setor com esse nome.', 'nome');
  }

  async criar(u: Usuario, d: SetorEntrada) {
    await this.nomeLivre(d.nome);
    const s = await this.db.$transaction(async (tx) => {
      const s = await tx.setor.create({ data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'setores', itemId: s.id, depois: s });
      return s;
    });
    this.eventos.emitir('mudou', { area: 'setores' });
    return s;
  }

  async editar(u: Usuario, id: string, d: SetorEntrada) {
    const antes = await this.db.setor.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Setor não encontrado.');
    await this.nomeLivre(d.nome, id);
    const s = await this.db.$transaction(async (tx) => {
      const s = await tx.setor.update({ where: { id }, data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'setores', itemId: id, antes, depois: s });
      return s;
    });
    this.eventos.emitir('mudou', { area: 'setores' });
    return s;
  }

  async excluir(u: Usuario, id: string, destinoId: string) {
    if (id === destinoId) throw new ErroNegocio(400, 'Escolha outro setor de destino.', 'destinoId');
    const [s, d] = await Promise.all([
      this.db.setor.findFirst({ where: { id, excluidoEm: null } }),
      this.db.setor.findFirst({ where: { id: destinoId, excluidoEm: null } }),
    ]);
    if (!s) throw new ErroNegocio(404, 'Setor não encontrado.');
    if (!d) throw new ErroNegocio(400, 'Escolha o setor de destino.', 'destinoId');
    await this.db.$transaction(async (tx) => {
      const pessoas = await tx.pessoa.updateMany({ where: { setorId: id }, data: { setorId: destinoId } });
      const equips = await tx.equipamento.updateMany({ where: { setorId: id }, data: { setorId: destinoId } });
      await tx.setor.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, {
        atorId: u.acessoId, acao: 'excluir', area: 'setores', itemId: id, antes: s,
        depois: { destinoId, pessoasMovidas: pessoas.count, equipamentosMovidos: equips.count },
      });
    });
    this.eventos.emitir('mudou', { area: 'setores' });
    return { ok: true };
  }
}
