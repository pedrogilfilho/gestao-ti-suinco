import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

type R = { id: string; numero: string; descricao: string; setor: string };

describe('ramais', () => {
  it('cria, audita, lista por setor e número, e filtra/busca', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    const r = await ag.post('/api/ramais').send({ numero: '2010', descricao: 'Recepção', setor: 'Portaria' }).expect(201);
    await ag.post('/api/ramais').send({ numero: '2001', descricao: 'Ana', setor: 'Financeiro' }).expect(201);
    expect(await db.auditoria.count({ where: { area: 'ramais', itemId: r.body.id, acao: 'criar' } })).toBe(1);

    const b = (await ag.get('/api/ramais').expect(200)).body;
    expect(b.itens.map((x: R) => [x.setor, x.numero])).toEqual([['Financeiro', '2001'], ['Portaria', '2010']]);
    expect(b.setores).toEqual(['Financeiro', 'Portaria']);
    expect(((await ag.get('/api/ramais?setor=Portaria').expect(200)).body.itens as R[]).map((x) => x.numero)).toEqual(['2010']);
    expect(((await ag.get('/api/ramais?q=recep').expect(200)).body.itens as R[]).map((x) => x.numero)).toEqual(['2010']);
  });

  it('edita e exclui (lógico) com auditoria', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios', 'excluir'] });
    const ag = await entrarComo(app, t.email);
    const r = (await ag.post('/api/ramais').send({ numero: '2010' }).expect(201)).body as R;
    await ag.patch(`/api/ramais/${r.id}`).send({ numero: '2011', descricao: 'TI' }).expect(200);
    expect((await db.ramal.findFirstOrThrow({ where: { id: r.id } })).numero).toBe('2011');
    await ag.delete(`/api/ramais/${r.id}`).expect(200);
    expect((await db.ramal.findFirstOrThrow({ where: { id: r.id } })).excluidoEm).toBeTruthy();
    expect((await ag.get('/api/ramais').expect(200)).body.itens).toHaveLength(0);
    expect(await db.auditoria.count({ where: { area: 'ramais', itemId: r.id, acao: 'excluir' } })).toBe(1);
  });

  it('número obrigatório (400)', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    expect((await ag.post('/api/ramais').send({ numero: '  ' }).expect(400)).body.mensagem).toBe('Informe o ramal.');
  });

  it('solicitante vê a lista do portal mas não cria nem lista geral (403)', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    await (await entrarComo(app, t.email)).post('/api/ramais').send({ numero: '2010', setor: 'TI' }).expect(201);
    const s = await criarPessoaComAcesso(db, 'solicitante');
    const ag = await entrarComo(app, s.email);
    expect(((await ag.get('/api/ramais/lista?q=2010').expect(200)).body.itens as R[]).map((x) => x.numero)).toEqual(['2010']);
    await ag.get('/api/ramais').expect(403);
    await ag.post('/api/ramais').send({ numero: '2020' }).expect(403);
  });
});
