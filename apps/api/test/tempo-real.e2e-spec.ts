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

function conectar(cookie: string): Promise<Socket> {
  return new Promise((ok, erro) => {
    const s = io(`http://localhost:${porta}`, { path: '/socket.io', extraHeaders: { cookie }, transports: ['websocket'], reconnection: false });
    abertos.push(s);
    s.on('connect', () => ok(s));
    s.on('connect_error', erro);
  });
}
const cookieDe = async (email: string) => {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email, senha: SENHA }).expect(200);
  return (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
};
const espera = <T>(s: Socket, evento: string, ms = 3000) =>
  new Promise<T>((ok, erro) => { const t = setTimeout(() => erro(new Error(`sem ${evento}`)), ms); s.once(evento, (d: T) => { clearTimeout(t); ok(d); }); });

describe('tempo real', () => {
  it('equipe recebe "mudou" sem dados quando um empréstimo é registrado', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar'] });
    const s = await conectar(await cookieDe(t.email));
    const recebido = espera(s, 'mudou');
    await db.config.create({ data: { chave: 'nucleo', valor: { assinaturas: false } } });
    const nb = await db.equipamento.create({ data: { codigo: 'NB-T', tipo: 'Notebook Empréstimo' } });
    await (await entrarComo(app, t.email)).post('/api/emprestimos').send({
      equipamentoId: nb.id, pessoaId: t.pessoaId, finalidade: 'Viagem',
      retiradaEm: new Date().toISOString(), previsaoEm: new Date(Date.now() + 86400e3).toISOString(),
    }).expect(201);
    expect(await recebido).toEqual({ area: 'emprestimos' });
  });
  it('solicitante só recebe o que é dele', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['equipamentos'] });
    const s1 = await criarPessoaComAcesso(db, 'solicitante');
    const sock = await conectar(await cookieDe(s1.email));
    let chegou = false;
    sock.on('mudou', () => { chegou = true; });
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/equipamentos').send({ codigo: 'M1', tipo: 'Monitor' }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(chegou).toBe(false);
    const e = await db.equipamento.create({ data: { codigo: 'CEL-S', tipo: 'Celular' } });
    const meu = espera(sock, 'mudou');
    await ag.post(`/api/equipamentos/${e.id}/vincular`).send({ pessoaId: s1.pessoaId }).expect(200);
    expect(await meu).toEqual({ area: 'equipamentos' });
  });
  it('sem login a conexão é recusada', async () => {
    await expect(conectar('gt_sessao=lixo')).rejects.toThrow('Entre no sistema para continuar.');
  });
  it('suspenso é desconectado na hora, com aviso (Foco de revisão 4)', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await criarPessoaComAcesso(db, 'tic');
    const s = await conectar(await cookieDe(t.email));
    const aviso = espera<{ motivo: string }>(s, 'sair');
    const saiu = espera(s, 'disconnect');
    await (await entrarComo(app, m.email)).post(`/api/acessos/${t.acessoId}/suspender`).expect(200);
    expect((await aviso).motivo).toBe('Sua sessão foi encerrada pela TI.');
    await saiu;
    expect(s.connected).toBe(false);
  });
});
