import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const tic = () => criarPessoaComAcesso(db, 'tic', { permissoes: ['equipamentos', 'emprestar'] });

describe('equipamentos', () => {
  it('cria e devolve a situação exibida', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const r = await ag.post('/api/equipamentos').send({ codigo: 'NB-10', tipo: 'Notebook Empréstimo', ipTipo: 'dhcp' }).expect(201);
    const l = await ag.get('/api/equipamentos?q=nb-10').expect(200);
    expect(l.body.itens[0]).toMatchObject({ id: r.body.id, situacaoExibida: { txt: 'Disponível' } });
  });
  it('código repetido: 409 com o rótulo "Nome"', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/equipamentos').send({ codigo: 'X1', tipo: 'Monitor' }).expect(201);
    const r = await ag.post('/api/equipamentos').send({ codigo: 'x1', tipo: 'Monitor' }).expect(409);
    expect(r.body).toEqual({ mensagem: 'Já existe equipamento com esse Nome.', campo: 'codigo' });
  });
  it('IP fixo repetido entre equipamentos é recusado', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/equipamentos').send({ codigo: 'D1', tipo: 'Desktop', ipTipo: 'fixo', ip: '10.0.0.5' }).expect(201);
    const r = await ag.post('/api/equipamentos').send({ codigo: 'D2', tipo: 'Desktop', ipTipo: 'fixo', ip: '10.0.0.5' }).expect(409);
    expect(r.body.mensagem).toBe('Esse IP já está em D1.');
  });
  it('trocar para DHCP apaga o IP (paridade sEquipIp)', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const e = await ag.post('/api/equipamentos').send({ codigo: 'D3', tipo: 'Desktop', ipTipo: 'fixo', ip: '10.0.0.7' });
    await ag.patch(`/api/equipamentos/${e.body.id}`).send({ codigo: 'D3', tipo: 'Desktop', ipTipo: 'dhcp', ip: '10.0.0.7' }).expect(200);
    expect((await db.equipamento.findUnique({ where: { id: e.body.id } }))!.ip).toBeNull();
  });
  it('vincular grava vinculado_em e mantém a data se o vínculo não mudar', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const e = await ag.post('/api/equipamentos').send({ codigo: 'C1', tipo: 'Celular', pessoaId: t.pessoaId }).expect(201);
    const d1 = (await db.equipamento.findUnique({ where: { id: e.body.id } }))!.vinculadoEm;
    expect(d1).not.toBeNull();
    await ag.patch(`/api/equipamentos/${e.body.id}`).send({ codigo: 'C1', tipo: 'Celular', pessoaId: t.pessoaId, obs: 'x' }).expect(200);
    expect((await db.equipamento.findUnique({ where: { id: e.body.id } }))!.vinculadoEm).toEqual(d1);
  });
  it('vínculo em texto livre aparece como Vinculado (paridade sVinculo)', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/equipamentos').send({ codigo: 'TV-1', tipo: 'Outro', vinculoLivre: 'Sala de Reunião' }).expect(201);
    const l = await ag.get('/api/equipamentos?q=tv-1');
    expect(l.body.itens[0]).toMatchObject({ vinculoLivre: 'Sala de Reunião', situacaoExibida: { txt: 'Vinculado' } });
  });
  it('vincular e soltar pela rota própria (Editar usuário)', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const e = await db.equipamento.create({ data: { codigo: 'CEL-2', tipo: 'Celular' } });
    await ag.post(`/api/equipamentos/${e.id}/vincular`).send({ pessoaId: t.pessoaId }).expect(200);
    expect((await db.equipamento.findUnique({ where: { id: e.id } }))!.pessoaId).toBe(t.pessoaId);
    await ag.post(`/api/equipamentos/${e.id}/vincular`).send({ pessoaId: null }).expect(200);
    expect(await db.equipamento.findUnique({ where: { id: e.id } })).toMatchObject({ pessoaId: null, vinculadoEm: null });
  });
  it('não vincula equipamento que está emprestado', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const e = await db.equipamento.create({ data: { codigo: 'NB-3', tipo: 'Notebook Empréstimo' } });
    await db.emprestimo.create({ data: { equipamentoId: e.id, pessoaId: t.pessoaId, finalidade: 'Viagem', retiradaEm: new Date() } });
    const r = await ag.post(`/api/equipamentos/${e.id}/vincular`).send({ pessoaId: t.pessoaId }).expect(409);
    expect(r.body.mensagem).toBe('NB-3 está emprestado. Registre a devolução antes de vincular.');
  });
  it('filtro por situação e busca por número só com dígitos', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await db.equipamento.create({ data: { codigo: 'CHIP-1', tipo: 'Chip', numeroCorp: '(34) 99999-0001' } });
    await db.equipamento.create({ data: { codigo: 'MON-1', tipo: 'Monitor', situacao: 'danificado' } });
    expect((await ag.get('/api/equipamentos?q=999990001')).body.itens.map((e: { codigo: string }) => e.codigo)).toEqual(['CHIP-1']);
    expect((await ag.get('/api/equipamentos?situacao=danificado')).body.itens.map((e: { codigo: string }) => e.codigo)).toEqual(['MON-1']);
  });
  it('livres para empréstimo: só o tipo emprestável, disponível', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await db.equipamento.create({ data: { codigo: 'NB-A', tipo: 'Notebook Empréstimo' } });
    await db.equipamento.create({ data: { codigo: 'NB-B', tipo: 'Notebook Empréstimo', situacao: 'manutencao' } });
    await db.equipamento.create({ data: { codigo: 'NOTE-EMPRESA', tipo: 'Notebook' } });
    expect((await ag.get('/api/equipamentos/livres')).body.map((e: { codigo: string }) => e.codigo)).toEqual(['NB-A']);
  });
  it('consulta lê; sem permissão equipamentos não cria', async () => {
    const c = await criarPessoaComAcesso(db, 'consulta');
    const ag = await entrarComo(app, c.email);
    await ag.get('/api/equipamentos').expect(200);
    await ag.post('/api/equipamentos').send({ codigo: 'Z', tipo: 'Monitor' }).expect(403);
  });
  it('não exclui com empréstimo aberto', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const e = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
    await db.emprestimo.create({ data: { equipamentoId: e.id, pessoaId: m.pessoaId, finalidade: 'Viagem', retiradaEm: new Date() } });
    const r = await ag.delete(`/api/equipamentos/${e.id}`).expect(409);
    expect(r.body.mensagem).toBe('NB-1 está emprestado. Registre a devolução antes de excluir.');
  });
  it('lote: válidas gravadas, erros por linha, repetido na lista e Nome existente não sobrescreve', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await db.equipamento.create({ data: { codigo: 'L9', tipo: 'Monitor', modelo: 'original' } });
    const r = await ag.post('/api/equipamentos/lote').send({ linhas: [
      { codigo: 'L1', tipo: 'Monitor' }, { codigo: 'L2', tipo: 'Geladeira' }, { codigo: 'l1', tipo: 'Monitor' }, { codigo: 'L9', tipo: 'Monitor', modelo: 'novo' },
    ] }).expect(200);
    expect(r.body).toEqual({ criados: 1, erros: [
      { linha: 2, mensagem: 'Tipo de equipamento inválido.' },
      { linha: 3, mensagem: 'Nome repetido na lista (linha 1).' },
      { linha: 4, mensagem: 'Já existe equipamento com esse Nome.' },
    ] });
    expect((await db.equipamento.findFirst({ where: { codigo: 'L9' } }))!.modelo).toBe('original');
  });
});
