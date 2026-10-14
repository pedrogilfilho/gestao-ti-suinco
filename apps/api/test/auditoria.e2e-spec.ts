import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('auditoria', () => {
  it('restaurar exclusão limpa excluido_em e gera novo registro', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const e = await ag.post('/api/equipamentos').send({ codigo: 'R1', tipo: 'Monitor' }).expect(201);
    await ag.delete(`/api/equipamentos/${e.body.id}`).expect(200);
    const reg = await db.auditoria.findFirstOrThrow({ where: { acao: 'excluir', itemId: e.body.id } });
    await ag.post(`/api/auditoria/${reg.id}/restaurar`).expect(200);
    expect((await db.equipamento.findUnique({ where: { id: e.body.id } }))!.excluidoEm).toBeNull();
    expect(await db.auditoria.count({ where: { acao: 'restaurar', itemId: e.body.id } })).toBe(1);
  });
  it('restaurar quando outro ativo já usa o mesmo Nome: 409 (Foco de revisão 3)', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const e = await ag.post('/api/equipamentos').send({ codigo: 'R2', tipo: 'Monitor' });
    await ag.delete(`/api/equipamentos/${e.body.id}`);
    await ag.post('/api/equipamentos').send({ codigo: 'R2', tipo: 'Monitor' }).expect(201);
    const reg = await db.auditoria.findFirstOrThrow({ where: { acao: 'excluir', itemId: e.body.id } });
    const r = await ag.post(`/api/auditoria/${reg.id}/restaurar`).expect(409);
    expect(r.body.mensagem).toBe('Não dá para restaurar: já existe outro cadastro ativo com o mesmo Nome (R2).');
  });
  it('restaurar pessoa excluída quando o e-mail já foi reusado: 409', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const p = await ag.post('/api/pessoas').send({ nome: 'Z', email: 'z@suinco.com.br', setorId: m.setorId });
    await ag.delete(`/api/pessoas/${p.body.id}`).expect(200);
    await ag.post('/api/pessoas').send({ nome: 'Z2', email: 'z@suinco.com.br', setorId: m.setorId }).expect(201);
    const reg = await db.auditoria.findFirstOrThrow({ where: { acao: 'excluir', itemId: p.body.id } });
    const r = await ag.post(`/api/auditoria/${reg.id}/restaurar`).expect(409);
    expect(r.body.mensagem).toBe('Não dá para restaurar: já existe outro cadastro ativo com o mesmo e-mail (z@suinco.com.br).');
  });
  it('restaurar edição volta o "antes"; se mudou depois, avisa', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const s = await ag.post('/api/setores').send({ nome: 'A' });
    await ag.patch(`/api/setores/${s.body.id}`).send({ nome: 'B' });
    const ed1 = await db.auditoria.findFirstOrThrow({ where: { acao: 'editar', itemId: s.body.id } });
    await ag.patch(`/api/setores/${s.body.id}`).send({ nome: 'C' });
    const r = await ag.post(`/api/auditoria/${ed1.id}/restaurar`).expect(409);
    expect(r.body.mensagem).toBe('Esse cadastro mudou depois dessa alteração. Restaure a alteração mais recente primeiro.');
    const ed2 = await db.auditoria.findFirstOrThrow({ where: { acao: 'editar', itemId: s.body.id }, orderBy: { em: 'desc' } });
    await ag.post(`/api/auditoria/${ed2.id}/restaurar`).expect(200);
    expect((await db.setor.findUnique({ where: { id: s.body.id } }))!.nome).toBe('B');
  });
  it('restaurar edição de equipamento devolve datas e campos', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const e = await ag.post('/api/equipamentos').send({ codigo: 'G1', tipo: 'Monitor', garantiaAte: '2027-01-31', modelo: 'Antigo' });
    await ag.patch(`/api/equipamentos/${e.body.id}`).send({ codigo: 'G1', tipo: 'Monitor', modelo: 'Novo' }).expect(200);
    const ed = await db.auditoria.findFirstOrThrow({ where: { acao: 'editar', itemId: e.body.id } });
    await ag.post(`/api/auditoria/${ed.id}/restaurar`).expect(200);
    const depois = await db.equipamento.findUniqueOrThrow({ where: { id: e.body.id } });
    expect(depois.modelo).toBe('Antigo');
    expect(depois.garantiaAte!.toISOString().slice(0, 10)).toBe('2027-01-31');
  });
  it('TIC com auditoria lê; sem permissão excluir não restaura', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['auditoria', 'usuarios'] });
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/setores').send({ nome: 'Novo' }).expect(201);
    const l = await ag.get('/api/auditoria?area=setores').expect(200);
    expect(l.body.itens[0]).toMatchObject({ acao: 'criar', area: 'setores', ator: { nome: t.email.split('@')[0] }, restauravel: false });
    const reg = await db.auditoria.findFirstOrThrow({ where: { area: 'setores' } });
    await ag.post(`/api/auditoria/${reg.id}/restaurar`).expect(403);
  });
  it('sem permissão auditoria: 403', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });
    await (await entrarComo(app, t.email)).get('/api/auditoria').expect(403);
  });
  it('filtros por ação e por quem fez; a senha nunca aparece', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    await ag.post('/api/setores').send({ nome: 'X' });
    const t = await criarPessoaComAcesso(db, 'tic');
    await ag.post(`/api/acessos/${t.acessoId}/senha-temporaria`).expect(200);
    const l = await ag.get(`/api/auditoria?acao=senha&atorId=${m.acessoId}`).expect(200);
    expect(l.body.itens).toHaveLength(1);
    expect(JSON.stringify(l.body)).not.toMatch(/senhaHash|argon2/);
  });
});
