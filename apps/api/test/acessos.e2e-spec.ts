import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('acessos', () => {
  it('criar devolve senha temporária e marca troca obrigatória', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const p = await db.pessoa.create({ data: { nome: 'Nova', email: 'nova@suinco.com.br', setorId: m.setorId } });
    const r = await ag.post('/api/acessos').send({ pessoaId: p.id, papel: 'tic', permissoes: { emprestar: true } }).expect(201);
    expect(r.body.senhaTemporaria).toMatch(/^[A-Za-z]{6}\d{2}$/);
    const nova = await entrarComo(app, 'nova@suinco.com.br', r.body.senhaTemporaria);
    expect((await nova.get('/api/auth/eu')).body.trocarSenha).toBe(true);
  });
  it('pessoa que já tem acesso: 409', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const r = await (await entrarComo(app, m.email)).post('/api/acessos').send({ pessoaId: m.pessoaId, papel: 'tic' }).expect(409);
    expect(r.body.mensagem).toBe('Essa pessoa já tem acesso.');
  });
  it('ninguém além de outro dono altera o acesso de um dono; ninguém apaga', async () => {
    const dono = await criarPessoaComAcesso(db, 'master', { email: 'dono@suinco.com.br' });
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const r = await ag.post(`/api/acessos/${dono.acessoId}/suspender`).expect(403);
    expect(r.body.mensagem).toBe('O acesso do dono do app só pode ser alterado por um dono.');
    await ag.patch(`/api/acessos/${dono.acessoId}`).send({ papel: 'consulta' }).expect(403);
    await (await entrarComo(app, dono.email)).delete(`/api/acessos/${dono.acessoId}`).expect(403);
  });
  it('grupo: mudar as permissões do grupo vale na hora para quem está nele', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const g = await ag.post('/api/grupos').send({ nome: 'Suporte N1', permissoes: { emprestar: true } }).expect(201);
    const t = await criarPessoaComAcesso(db, 'tic');
    await ag.patch(`/api/acessos/${t.acessoId}`).send({ grupoId: g.body.id }).expect(200);
    const agT = await entrarComo(app, t.email);
    expect((await agT.get('/api/auth/eu')).body.permissoes).toEqual(['emprestar']);
    await ag.patch(`/api/grupos/${g.body.id}`).send({ nome: 'Suporte N1', permissoes: { emprestar: true, auditoria: true } }).expect(200);
    expect((await agT.get('/api/auth/eu')).body.permissoes).toEqual(['auditoria', 'emprestar']);
  });
  it('grupo sem nome é recusado; grupo com gente dentro não é excluído', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    expect((await ag.post('/api/grupos').send({ nome: '  ', permissoes: {} }).expect(400)).body.mensagem).toBe('Informe o nome do grupo.');
    const g = await ag.post('/api/grupos').send({ nome: 'G', permissoes: {} });
    const t = await criarPessoaComAcesso(db, 'tic');
    await ag.patch(`/api/acessos/${t.acessoId}`).send({ grupoId: g.body.id });
    expect((await ag.delete(`/api/grupos/${g.body.id}`).expect(409)).body.mensagem).toBe('Tire as pessoas do grupo antes de excluir.');
  });
  it('forçar logout derruba a pessoa', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await criarPessoaComAcesso(db, 'tic');
    const agT = await entrarComo(app, t.email);
    await new Promise((r) => setTimeout(r, 1100)); // o iat do JWT é em segundos
    await (await entrarComo(app, m.email)).post(`/api/acessos/${t.acessoId}/forcar-logout`).expect(200);
    await agT.get('/api/auth/eu').expect(401);
  });
  it('suspender e reativar', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await criarPessoaComAcesso(db, 'tic');
    const ag = await entrarComo(app, m.email);
    await ag.post(`/api/acessos/${t.acessoId}/suspender`).expect(200);
    expect((await db.acesso.findUnique({ where: { id: t.acessoId } }))!.suspenso).toBe(true);
    await ag.post(`/api/acessos/${t.acessoId}/reativar`).expect(200);
    await entrarComo(app, t.email);
    expect(await db.auditoria.count({ where: { area: 'acessos', acao: { in: ['suspender', 'reativar'] } } })).toBe(2);
  });
  it('não suspende o próprio acesso', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const r = await (await entrarComo(app, m.email)).post(`/api/acessos/${m.acessoId}/suspender`).expect(400);
    expect(r.body.mensagem).toBe('Você não pode suspender o próprio acesso.');
  });
  it('senha temporária nova obriga a trocar e derruba a sessão antiga', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await criarPessoaComAcesso(db, 'tic');
    const agT = await entrarComo(app, t.email);
    await new Promise((r) => setTimeout(r, 1100));
    const r = await (await entrarComo(app, m.email)).post(`/api/acessos/${t.acessoId}/senha-temporaria`).expect(200);
    await agT.get('/api/auth/eu').expect(401);
    const nova = await entrarComo(app, t.email, r.body.senhaTemporaria);
    expect((await nova.get('/api/auth/eu')).body.trocarSenha).toBe(true);
  });
  it('sem permissão acessos: 403', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    await (await entrarComo(app, t.email)).get('/api/acessos').expect(403);
  });
  it('lista na ordem Master, TIC, Solicitante, Somente consulta, com nome do perfil e dono', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    await criarPessoaComAcesso(db, 'consulta'); await criarPessoaComAcesso(db, 'solicitante'); await criarPessoaComAcesso(db, 'tic');
    await criarPessoaComAcesso(db, 'solicitante', { email: 'dono@suinco.com.br' });
    const r = await (await entrarComo(app, m.email)).get('/api/acessos').expect(200);
    expect(r.body.itens.map((a: { papel: string }) => a.papel)).toEqual(['master', 'tic', 'solicitante', 'solicitante', 'consulta']);
    expect(r.body.itens[0]).toMatchObject({ nomePapel: 'Administrador Master', dono: false, permissoes: expect.arrayContaining(['excluir']) });
    expect(r.body.itens.find((a: { pessoa: { email: string } }) => a.pessoa.email === 'dono@suinco.com.br')).toMatchObject({ dono: true });
  });
  it('remover um acesso não apaga a pessoa', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await criarPessoaComAcesso(db, 'tic');
    await (await entrarComo(app, m.email)).delete(`/api/acessos/${t.acessoId}`).expect(200);
    expect(await db.acesso.count({ where: { id: t.acessoId } })).toBe(0);
    expect(await db.pessoa.count({ where: { id: t.pessoaId, excluidoEm: null } })).toBe(1);
  });
});
