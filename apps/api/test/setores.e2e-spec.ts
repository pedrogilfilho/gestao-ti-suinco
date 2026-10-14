import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('setores', () => {
  it('consulta lê, mas não cria', async () => {
    const c = await criarPessoaComAcesso(db, 'consulta');
    const ag = await entrarComo(app, c.email);
    await ag.get('/api/setores').expect(200);
    await ag.post('/api/setores').send({ nome: 'RH' }).expect(403);
  });
  it('solicitante não lê a lista', async () => {
    const s = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, s.email)).get('/api/setores').expect(403);
  });
  it('lista com a contagem de pessoas e equipamentos', async () => {
    const t = await criarPessoaComAcesso(db, 'tic');
    await db.equipamento.create({ data: { codigo: 'D1', tipo: 'Desktop', setorId: t.setorId } });
    const r = await (await entrarComo(app, t.email)).get('/api/setores').expect(200);
    expect(r.body.itens).toEqual([{ id: t.setorId, nome: 'TI', pessoas: 1, equipamentos: 1 }]);
  });
  it('cria, recusa nome repetido (sem diferenciar maiúsculas) e audita', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    const r = await ag.post('/api/setores').send({ nome: '  Recursos   Humanos ' }).expect(201);
    expect(r.body.nome).toBe('Recursos Humanos');
    const dup = await ag.post('/api/setores').send({ nome: 'recursos humanos' }).expect(409);
    expect(dup.body.mensagem).toBe('Já existe um setor com esse nome.');
    expect(await db.auditoria.count({ where: { area: 'setores', acao: 'criar', itemId: r.body.id } })).toBe(1);
  });
  it('nome repetido sem acento também é recusado (paridade sE)', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/setores').send({ nome: 'Manutenção' }).expect(201);
    await ag.post('/api/setores').send({ nome: 'manutencao' }).expect(409);
  });
  it('renomear com auditoria de antes e depois', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    await ag.patch(`/api/setores/${t.setorId}`).send({ nome: 'Tecnologia' }).expect(200);
    const a = await db.auditoria.findFirstOrThrow({ where: { area: 'setores', acao: 'editar' } });
    expect(a.antes).toMatchObject({ nome: 'TI' });
    expect(a.depois).toMatchObject({ nome: 'Tecnologia' });
  });
  it('excluir move pessoas e equipamentos para o destino, numa transação', async () => {
    const m = await criarPessoaComAcesso(db, 'master', { setorNome: 'Origem' });
    const ag = await entrarComo(app, m.email);
    const destino = await db.setor.create({ data: { nome: 'Destino' } });
    await db.equipamento.create({ data: { codigo: 'D1', tipo: 'Desktop', setorId: m.setorId } });
    await ag.delete(`/api/setores/${m.setorId}`).send({ destinoId: destino.id }).expect(200);
    expect(await db.pessoa.count({ where: { setorId: destino.id } })).toBe(1);
    expect(await db.equipamento.count({ where: { setorId: destino.id } })).toBe(1);
    expect((await db.setor.findUnique({ where: { id: m.setorId } }))!.excluidoEm).not.toBeNull();
  });
  it('excluir exige a permissão excluir', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    const ag = await entrarComo(app, t.email);
    const d = await db.setor.create({ data: { nome: 'X' } });
    await ag.delete(`/api/setores/${t.setorId}`).send({ destinoId: d.id }).expect(403);
  });
});
