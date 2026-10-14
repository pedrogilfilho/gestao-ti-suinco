import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('login', () => {
  it('entra com e-mail em maiúsculas e devolve quem é', async () => {
    await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br', permissoes: ['emprestar'] });
    const ag = request.agent(app.getHttpServer());
    await ag.post('/api/auth/login').send({ email: ' ANA@suinco.com.br', senha: 'Teste@1234' }).expect(200);
    const eu = await ag.get('/api/auth/eu').expect(200);
    expect(eu.body).toMatchObject({ email: 'ana@suinco.com.br', papel: 'tic', permissoes: ['emprestar'], equipeTI: true });
  });
  it('senha errada: 401 com mensagem genérica', async () => {
    await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'ana@suinco.com.br', senha: 'x' }).expect(401);
    expect(r.body.mensagem).toBe('E-mail ou senha incorretos.');
  });
  it('e-mail que não existe: mesma mensagem', async () => {
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'ninguem@suinco.com.br', senha: 'x' }).expect(401);
    expect(r.body.mensagem).toBe('E-mail ou senha incorretos.');
  });
  it('5 erros travam por 15 minutos, mesmo com a senha certa depois', async () => {
    await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ email: 'ana@suinco.com.br', senha: 'errada' });
    const r = await http.post('/api/auth/login').send({ email: 'ana@suinco.com.br', senha: 'Teste@1234' }).expect(429);
    expect(r.body.mensagem).toMatch(/Muitas tentativas/);
  });
  it('sem login: 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/eu').expect(401);
  });
  it('cookie httpOnly', async () => {
    await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'ana@suinco.com.br', senha: 'Teste@1234' });
    expect(String(r.headers['set-cookie'])).toMatch(/gt_sessao=.+HttpOnly/i);
  });
  it('logout apaga o cookie', async () => {
    const a = await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const ag = await entrarComo(app, a.email);
    await ag.post('/api/auth/logout').expect(200);
    await ag.get('/api/auth/eu').expect(401);
  });
});

describe('sessão', () => {
  it('suspender derruba na próxima requisição', async () => {
    const a = await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const ag = await entrarComo(app, a.email);
    await db.acesso.update({ where: { id: a.acessoId }, data: { suspenso: true } });
    const r = await ag.get('/api/auth/eu').expect(401);
    expect(r.body.mensagem).toBe('Seu acesso está suspenso. Fale com a TI.');
  });
  it('forçar logout (revogado_em) derruba tokens emitidos antes', async () => {
    const a = await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br' });
    const ag = await entrarComo(app, a.email);
    await db.acesso.update({ where: { id: a.acessoId }, data: { revogadoEm: new Date(Date.now() + 1000) } });
    await ag.get('/api/auth/eu').expect(401);
  });
  it('troca de senha pendente: só deixa trocar a senha e sair', async () => {
    const a = await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br', trocar: true });
    const ag = await entrarComo(app, a.email);
    const eu = await ag.get('/api/auth/eu').expect(200);
    expect(eu.body.trocarSenha).toBe(true);
    await ag.get('/api/setores').expect(403);
    await ag.post('/api/auth/trocar-senha').send({ atual: 'Teste@1234', nova: 'NovaSenha123' }).expect(200);
    await ag.get('/api/auth/eu').expect(200).then((r) => expect(r.body.trocarSenha).toBe(false));
  });
  it('trocar senha com a atual errada: 400 no campo atual', async () => {
    const a = await criarPessoaComAcesso(db, 'tic', { email: 'ana@suinco.com.br', trocar: true });
    const ag = await entrarComo(app, a.email);
    const r = await ag.post('/api/auth/trocar-senha').send({ atual: 'errada', nova: 'NovaSenha123' }).expect(400);
    expect(r.body).toMatchObject({ mensagem: 'A senha atual não confere.', campo: 'atual' });
  });
  it('dono vem da variável DONOS', async () => {
    const a = await criarPessoaComAcesso(db, 'solicitante', { email: 'dono@suinco.com.br' });
    const ag = await entrarComo(app, a.email);
    const eu = await ag.get('/api/auth/eu');
    expect(eu.body.dono).toBe(true);
    expect(eu.body.permissoes).toHaveLength(9);
  });
  it('token de outra assinatura é recusado', async () => {
    await request(app.getHttpServer()).get('/api/auth/eu').set('Cookie', 'gt_sessao=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.assinatura-falsa').expect(401);
  });
});
