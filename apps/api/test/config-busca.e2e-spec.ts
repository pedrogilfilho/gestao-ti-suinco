import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('config', () => {
  it('sem nada gravado, devolve os padrões do app atual', async () => {
    const t = await criarPessoaComAcesso(db, 'tic');
    const r = await (await entrarComo(app, t.email)).get('/api/config').expect(200);
    expect(r.body).toMatchObject({ tiposEmprestaveis: ['Notebook Empréstimo'], bloqueioAtraso: true, assinaturas: true, avisoMin: 120 });
    expect(r.body.finalidades).toContainEqual({ nome: 'Home office', dias: 7, hora: '17:00' });
  });
  it('salvar parcial mantém o resto e audita', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    await ag.patch('/api/config').send({ glpiUrl: 'https://glpi.suinco.com.br/ticket?id=' }).expect(200);
    const r = await ag.get('/api/config');
    expect(r.body).toMatchObject({ glpiUrl: 'https://glpi.suinco.com.br/ticket?id=', assinaturas: true });
    expect(await db.auditoria.count({ where: { area: 'config' } })).toBe(1);
  });
  it('desligar assinaturas vale para o próximo empréstimo', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    await ag.patch('/api/config').send({ assinaturas: false }).expect(200);
    const nb = await db.equipamento.create({ data: { codigo: 'NB-9', tipo: 'Notebook Empréstimo' } });
    await ag.post('/api/emprestimos').send({ equipamentoId: nb.id, pessoaId: m.pessoaId, finalidade: 'Viagem', retiradaEm: new Date().toISOString(), previsaoEm: new Date(Date.now() + 86400e3).toISOString() }).expect(201);
  });
  it('lista de tipos vazia não salva', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const r = await (await entrarComo(app, m.email)).patch('/api/config').send({ tiposEmprestaveis: [] }).expect(400);
    expect(r.body.mensagem).toBe('Escolha pelo menos um tipo de equipamento de empréstimo.');
  });
  it('sem permissão config: 403 no PATCH; solicitante lê (a página de pedidos precisa)', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar'] });
    await (await entrarComo(app, t.email)).patch('/api/config').send({ assinaturas: false }).expect(403);
    const s = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, s.email)).get('/api/config').expect(200);
  });
});

describe('busca', () => {
  it('acha equipamento por patrimônio e pessoa por telefone só com números, até 5 por grupo com total', async () => {
    const t = await criarPessoaComAcesso(db, 'tic');
    const ag = await entrarComo(app, t.email);
    for (let i = 0; i < 7; i++) await db.equipamento.create({ data: { codigo: `M${i}`, tipo: 'Monitor', patrimonio: `PAT-77${i}` } });
    await db.pessoa.create({ data: { nome: 'Zé', email: 'ze@suinco.com.br', setorId: t.setorId, telefoneCorp: '(34) 99977-0000' } });
    const r = await ag.get('/api/busca?q=77').expect(200);
    const eq = r.body.grupos.find((g: { nome: string }) => g.nome === 'Equipamentos');
    expect(eq.total).toBe(7); expect(eq.itens).toHaveLength(5);
    expect(eq.itens[0].ir).toBe('/equipamentos?q=M0');
    const us = r.body.grupos.find((g: { nome: string }) => g.nome === 'Usuários');
    expect(us.itens[0].t).toContain('Zé');
  });
  it('acha empréstimo pelo nome de quem pegou', async () => {
    const t = await criarPessoaComAcesso(db, 'tic');
    const p = await db.pessoa.create({ data: { nome: 'Joana Prado', email: 'joana@suinco.com.br', setorId: t.setorId } });
    const e = await db.equipamento.create({ data: { codigo: 'NB-J', tipo: 'Notebook Empréstimo' } });
    await db.emprestimo.create({ data: { equipamentoId: e.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date() } });
    const r = await (await entrarComo(app, t.email)).get('/api/busca?q=joana').expect(200);
    expect(r.body.grupos.find((g: { nome: string }) => g.nome === 'Empréstimos').itens[0].t).toContain('NB-J');
  });
  it('busca com menos de 2 letras devolve vazio; solicitante não busca', async () => {
    const t = await criarPessoaComAcesso(db, 'tic');
    expect((await (await entrarComo(app, t.email)).get('/api/busca?q=a')).body.grupos).toEqual([]);
    const s = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, s.email)).get('/api/busca?q=ab').expect(403);
  });
});
