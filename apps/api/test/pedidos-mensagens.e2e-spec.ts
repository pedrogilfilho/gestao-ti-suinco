import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, SENHA } from './app';

let app: INestApplication, db: PrismaClient, porta: number;
const abertos: Socket[] = [];
beforeAll(async () => {
  ({ app, db } = await montarApp());
  await app.listen(0);
  porta = (app.getHttpServer().address() as { port: number }).port;
});
beforeEach(async () => limparBanco(db));
afterAll(async () => { abertos.forEach((s) => s.close()); await app.close(); await db.$disconnect(); });

const cookieDe = async (email: string) => {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha: SENHA }).expect(200);
  return (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
};
const conectar = (cookie: string) => new Promise<Socket>((ok, erro) => {
  const s = io(`http://localhost:${porta}`, { path: '/socket.io', extraHeaders: { cookie }, transports: ['websocket'], reconnection: false });
  abertos.push(s);
  s.on('connect', () => ok(s));
  s.on('connect_error', erro);
});
const espera = <T>(s: Socket, evento: string, ms = 3000) =>
  new Promise<T>((ok, erro) => { const t = setTimeout(() => erro(new Error(`sem ${evento}`)), ms); s.once(evento, (d: T) => { clearTimeout(t); ok(d); }); });

async function cenario() {
  const s = await criarPessoaComAcesso(db, 'solicitante');
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['reservar'] });
  const p = await db.pedido.create({ data: { pessoaId: s.pessoaId, tipo: 'Notebook Empréstimo', finalidade: 'Viagem', retiradaEm: new Date(), chamadoGlpi: '10' } });
  return { s, t, p, as: await entrarComo(app, s.email), at: await entrarComo(app, t.email) };
}

describe('conversa do pedido', () => {
  it('colaborador e TI conversam; a ordem e o lado ficam guardados', async () => {
    const { p, as, at } = await cenario();
    await as.post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'Preciso do carregador também' }).expect(201);
    await at.post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'Combinado' }).expect(201);
    const l = (await as.get(`/api/pedidos/${p.id}/mensagens`).expect(200)).body.itens as { de: string; texto: string }[];
    expect(l.map((m) => [m.de, m.texto])).toEqual([['colab', 'Preciso do carregador também'], ['ti', 'Combinado']]);
    expect((await db.pedido.findUnique({ where: { id: p.id } }))!.ultimaDe).toBe('ti');
  });
  it('quem não é dono nem TI de reserva/empréstimo não escreve', async () => {
    const { p } = await cenario();
    const c = await criarPessoaComAcesso(db, 'consulta');
    await (await entrarComo(app, c.email)).post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'oi' }).expect(403);
    const outro = await criarPessoaComAcesso(db, 'solicitante');
    const ao = await entrarComo(app, outro.email);
    await ao.post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'oi' }).expect(403);
    await ao.get(`/api/pedidos/${p.id}/mensagens`).expect(403);
  });
  it('pedido cancelado não recebe mensagem', async () => {
    const { p, as } = await cenario();
    await db.pedido.update({ where: { id: p.id }, data: { status: 'cancelado' } });
    expect((await as.post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'oi' }).expect(409)).body.mensagem).toBe('Esse pedido foi cancelado.');
  });
  it('mensagem do colaborador avisa a TI (sem o texto); não avisa o colaborador', async () => {
    const { s, t, p, as } = await cenario();
    const sockTi = await conectar(await cookieDe(t.email));
    const sockColab = await conectar(await cookieDe(s.email));
    let colabRecebeu = false;
    sockColab.on('mensagem', () => { colabRecebeu = true; });
    const chegou = espera<{ pedidoId: string }>(sockTi, 'mensagem');
    await as.post(`/api/pedidos/${p.id}/mensagens`).send({ texto: 'Alguém aí?' }).expect(201);
    expect(await chegou).toEqual({ pedidoId: p.id });
    await new Promise((r) => setTimeout(r, 200));
    expect(colabRecebeu).toBe(false);
  });
  it('TI troca o chamado e vira mensagem de sistema', async () => {
    const { p, at } = await cenario();
    await at.patch(`/api/pedidos/${p.id}/chamado`).send({ chamadoGlpi: '10' }).expect(400);
    await at.patch(`/api/pedidos/${p.id}/chamado`).send({ chamadoGlpi: '77' }).expect(200);
    const m = await db.pedidoMensagem.findFirst({ where: { pedidoId: p.id } });
    expect(m).toMatchObject({ de: 'sistema', texto: 'TI alterou o chamado de 10 para 77.' });
  });
});
