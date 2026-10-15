import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type RamalEntrada } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import { termos } from '../comum/lista';
import type { Usuario } from '../auth/decorators';

@Injectable()
export class RamaisService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  async listar(f: { q: string; setor: string }) {
    const porTermo = termos(f.q).map((t): Prisma.RamalWhereInput => ({
      OR: [{ numero: { contains: t, mode: 'insensitive' } }, { descricao: { contains: t, mode: 'insensitive' } }, { setor: { contains: t, mode: 'insensitive' } }],
    }));
    const itens = await this.db.ramal.findMany({
      where: { excluidoEm: null, ...(f.setor && { setor: f.setor }), AND: porTermo },
      orderBy: [{ setor: 'asc' }, { numero: 'asc' }],
    });
    const setores = await this.db.ramal.findMany({ where: { excluidoEm: null, NOT: { setor: '' } }, distinct: ['setor'], select: { setor: true }, orderBy: { setor: 'asc' } });
    return { itens, setores: setores.map((s) => s.setor) };
  }

  async criar(u: Usuario, d: RamalEntrada) {
    const r = await this.db.$transaction(async (tx) => {
      const r = await tx.ramal.create({ data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'ramais', itemId: r.id, depois: r });
      return r;
    });
    this.eventos.emitir('mudou', { area: 'ramais' });
    return r;
  }

  async editar(u: Usuario, id: string, d: RamalEntrada) {
    const antes = await this.db.ramal.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Ramal não encontrado.');
    const r = await this.db.$transaction(async (tx) => {
      const r = await tx.ramal.update({ where: { id }, data: d });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'ramais', itemId: id, antes, depois: r });
      return r;
    });
    this.eventos.emitir('mudou', { area: 'ramais' });
    return r;
  }

  async excluir(u: Usuario, id: string) {
    const antes = await this.db.ramal.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Ramal não encontrado.');
    await this.db.$transaction(async (tx) => {
      await tx.ramal.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'ramais', itemId: id, antes });
    });
    this.eventos.emitir('mudou', { area: 'ramais' });
    return { ok: true };
  }
}
