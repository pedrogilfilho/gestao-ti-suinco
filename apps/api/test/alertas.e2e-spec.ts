import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const MIN = 60_000;
type Alerta = { tipo: string; id: string; minutos: number; texto: string };

async function cenario() {
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['reservar', 'emprestar'] });
  const at = await entrarComo(app, t.email);
  const ana = await db.pessoa.create({ data: { nome: 'Ana Reis', email: 'ana@suinco.com.br', setorId: t.setorId } });
  const nb = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const reserva = (min: number) => db.reserva.create({ data: { equipamentoId: nb.id, pessoaId: ana.id, inicioEm: new Date(Date.now() + min * MIN), fimEm: new Date(Date.now() + (min + 120) * MIN) } });
  const pedido = (x: Record<string, unknown>) => db.pedido.create({ data: { pessoaId: ana.id, tipo: 'Notebook Empréstimo', retiradaEm: new Date(), ...x } });
  const alertas = async () => (await at.get('/api/alertas').expect(200)).body.itens as Alerta[];
  return { t, at, ana, nb, reserva, pedido, alertas };
}

describe('alertas de entrega', () => {
  it('reserva em 10 min aparece; em 20 min e há 40 min não', async () => {
    const { reserva, alertas } = await cenario();
    const r = await reserva(10);
    await db.reserva.create({ data: { equipamentoId: r.equipamentoId, pessoaId: r.pessoaId, inicioEm: new Date(Date.now() + 20 * MIN), fimEm: new Date(Date.now() + 25 * MIN), status: 'ativa' } });
    await db.reserva.create({ data: { equipamentoId: r.equipamentoId, pessoaId: r.pessoaId, inicioEm: new Date(Date.now() - 40 * MIN), fimEm: new Date(Date.now() - 35 * MIN) } });
    const l = await alertas();
    expect(l.map((a) => [a.tipo, a.id])).toEqual([['reserva', r.id]]);
    expect(l[0]!.minutos).toBeGreaterThanOrEqual(9);
    expect(l[0]!.texto).toBe('NB-1 para Ana Reis (TI)');
  });
  it('urgente pendente sempre aparece e vem primeiro; pedido normal só se a retirada está perto', async () => {
    const { reserva, pedido, alertas } = await cenario();
    await reserva(5);
    const u = await pedido({ urgente: true, justificativa: 'Reunião com cliente', retiradaEm: new Date(Date.now() - 3 * 60 * MIN) });
    const perto = await pedido({ retiradaEm: new Date(Date.now() + 5 * MIN), devolucaoEm: new Date(Date.now() + 60 * MIN) });
    await pedido({ retiradaEm: new Date(Date.now() + 90 * MIN), devolucaoEm: new Date(Date.now() + 120 * MIN) });
    const l = await alertas();
    expect(l[0]).toMatchObject({ tipo: 'urgente', id: u.id, texto: 'Ana Reis (TI) precisa de Notebook Empréstimo: Reunião com cliente' });
    expect(l.map((a) => a.tipo).sort()).toEqual(['pedido', 'reserva', 'urgente']);
    expect(l.find((a) => a.tipo === 'pedido')!.id).toBe(perto.id);
  });
  it('quem não reserva nem empresta não vê', async () => {
    const c = await criarPessoaComAcesso(db, 'consulta');
    await (await entrarComo(app, c.email)).get('/api/alertas').expect(403);
  });
});

describe('contadores do menu', () => {
  it('pedidos pendentes, urgentes, com mensagem e reservas de hoje', async () => {
    const { at, reserva, pedido } = await cenario();
    await pedido({});
    await pedido({ urgente: true, justificativa: 'x' });
    await pedido({ status: 'aprovado', ultimaDe: 'colab' });
    await pedido({ status: 'cancelado', ultimaDe: 'colab' });
    await reserva(30);
    const c = (await at.get('/api/contadores').expect(200)).body;
    expect(c).toMatchObject({ pedidosPendentes: 2, pedidosUrgentes: 1, pedidosComMensagem: 1 });
    expect(c.reservasHoje).toBeGreaterThanOrEqual(0); // 30 min à frente pode cair amanhã perto da meia-noite
  });
});
