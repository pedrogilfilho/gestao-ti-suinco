import { Injectable } from '@nestjs/common';
import { PrismaService } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import type { Usuario } from '../auth/decorators';

// Quem fala com a TI no pedido: o colaborador dono; pela TI, quem reserva ou empresta.
const falaPelaTi = (u: Usuario) => u.permissoes.has('reservar') || u.permissoes.has('emprestar');

@Injectable()
export class MensagensService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  private async pedido(u: Usuario, id: string, escrever: boolean) {
    const p = await this.db.pedido.findFirst({ where: { id, excluidoEm: null } });
    if (!p) throw new ErroNegocio(404, 'Pedido não encontrado.');
    const dono = p.pessoaId === u.pessoaId;
    const podeVer = dono || u.equipeTI, podeEscrever = dono || falaPelaTi(u);
    if (!(escrever ? podeEscrever : podeVer)) throw new ErroNegocio(403, 'Você não tem permissão para isso.');
    return { p, dono };
  }

  async listar(u: Usuario, id: string) {
    await this.pedido(u, id, false);
    const ms = await this.db.pedidoMensagem.findMany({ where: { pedidoId: id }, orderBy: { em: 'asc' }, include: { autor: { select: { nome: true } } } });
    return { itens: ms.map((m) => ({ id: m.id, de: m.de, texto: m.texto, em: m.em, autor: m.autor?.nome ?? null })) };
  }

  async enviar(u: Usuario, id: string, texto: string) {
    const { p, dono } = await this.pedido(u, id, true);
    if (p.status === 'cancelado') throw new ErroNegocio(409, 'Esse pedido foi cancelado.');
    const de = dono ? 'colab' : 'ti';
    const agora = new Date();
    const m = await this.db.$transaction(async (tx) => {
      const m = await tx.pedidoMensagem.create({ data: { pedidoId: id, de, autorId: u.pessoaId, texto, em: agora } });
      await tx.pedido.update({ where: { id }, data: { ultimaDe: de, ultimaEm: agora } });
      return m;
    });
    if (de === 'colab') this.eventos.emitir('mensagem', { pedidoId: id });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    return m;
  }

  async trocarChamado(u: Usuario, id: string, chamadoGlpi: string) {
    const p = await this.db.pedido.findFirst({ where: { id, excluidoEm: null } });
    if (!p) throw new ErroNegocio(404, 'Pedido não encontrado.');
    if (p.chamadoGlpi === chamadoGlpi) throw new ErroNegocio(400, 'O chamado já está com esse número.', 'chamadoGlpi');
    const texto = p.chamadoGlpi ? `TI alterou o chamado de ${p.chamadoGlpi} para ${chamadoGlpi}.` : `TI informou o chamado ${chamadoGlpi}.`;
    await this.db.$transaction(async (tx) => {
      const depois = await tx.pedido.update({ where: { id }, data: { chamadoGlpi } });
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'sistema', texto } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pedidos', itemId: id, antes: p, depois });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    return { ok: true };
  }
}
