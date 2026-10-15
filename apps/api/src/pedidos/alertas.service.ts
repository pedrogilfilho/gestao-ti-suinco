import { Injectable } from '@nestjs/common';
import { horaSP } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';

const MIN = 60_000, JANELA = 15 * MIN, PASSADO = 30 * MIN;
export type Alerta = { tipo: 'reserva' | 'urgente' | 'pedido'; id: string; minutos: number; hora: string; texto: string };

// Alertas de entrega (spec 3.8): reserva começando em até 15 min (ou há até 30 min), pedido urgente pendente,
// pedido normal pendente com retirada em até 15 min.
@Injectable()
export class AlertasService {
  constructor(private db: PrismaService) {}

  async listar(agora = new Date()) {
    const de = new Date(agora.getTime() - PASSADO), ate = new Date(agora.getTime() + JANELA);
    const pessoa = { select: { nome: true, setor: { select: { nome: true } } } };
    const [reservas, urgentes, pedidos] = await Promise.all([
      this.db.reserva.findMany({ where: { status: 'ativa', excluidoEm: null, inicioEm: { gte: de, lte: ate } }, include: { pessoa, equipamento: { select: { codigo: true } } } }),
      this.db.pedido.findMany({ where: { status: 'pendente', urgente: true, excluidoEm: null }, include: { pessoa } }),
      this.db.pedido.findMany({ where: { status: 'pendente', urgente: false, excluidoEm: null, retiradaEm: { gte: de, lte: ate } }, include: { pessoa } }),
    ]);
    const min = (d: Date) => Math.round((d.getTime() - agora.getTime()) / MIN);
    const itens: Alerta[] = [
      ...urgentes.map((p) => ({ tipo: 'urgente' as const, id: p.id, minutos: min(p.retiradaEm), hora: horaSP(p.retiradaEm), texto: `${p.pessoa.nome} (${p.pessoa.setor.nome}) precisa de ${p.tipo}: ${p.justificativa}` })),
      ...reservas.map((r) => ({ tipo: 'reserva' as const, id: r.id, minutos: min(r.inicioEm), hora: horaSP(r.inicioEm), texto: `${r.equipamento.codigo} para ${r.pessoa.nome} (${r.pessoa.setor.nome})` })),
      ...pedidos.map((p) => ({ tipo: 'pedido' as const, id: p.id, minutos: min(p.retiradaEm), hora: horaSP(p.retiradaEm), texto: `${p.tipo} para ${p.pessoa.nome}` })),
    ];
    itens.sort((a, b) => Number(b.tipo === 'urgente') - Number(a.tipo === 'urgente') || a.minutos - b.minutos);
    return { itens };
  }
}
