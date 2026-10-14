import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, PNG } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const DIA = 86_400_000;
async function cenario() {
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar'] });
  const ag = await entrarComo(app, t.email);
  const p = await db.pessoa.create({ data: { nome: 'Rafa', email: 'rafa@suinco.com.br', setorId: t.setorId } });
  const nb1 = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const nb2 = await db.equipamento.create({ data: { codigo: 'NB-2', tipo: 'Notebook Empréstimo' } });
  const base = {
    pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date().toISOString(), previsaoEm: new Date(Date.now() + 3 * DIA).toISOString(),
    assinatura: PNG, acessorios: ['Carregador', 'Mouse'],
  };
  return { t, ag, p, nb1, nb2, base };
}

describe('registrar', () => {
  it('registra, técnico padrão é quem está logado, audita e guarda a assinatura como arquivo', async () => {
    const { t, ag, nb1, base } = await cenario();
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    const e = await db.emprestimo.findUnique({ where: { id: r.body.id } });
    expect(e!.tecnicoId).toBe(t.pessoaId);
    expect(e!.assinaturaRetiradaUrl).toMatch(/^assinaturas\/.+\.png$/);
    expect(await db.auditoria.count({ where: { area: 'emprestimos', itemId: r.body.id } })).toBe(1);
  });
  it('previsão obrigatória (paridade sA)', async () => {
    const { ag, nb1, base } = await cenario();
    const { previsaoEm, ...sem } = base;
    const r = await ag.post('/api/emprestimos').send({ ...sem, equipamentoId: nb1.id }).expect(400);
    expect(r.body).toMatchObject({ mensagem: 'Informe a previsão de entrega.', campo: 'previsaoEm' });
  });
  it('só tipo emprestável', async () => {
    const { ag, base } = await cenario();
    const d = await db.equipamento.create({ data: { codigo: 'DESK', tipo: 'Desktop' } });
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: d.id }).expect(409);
    expect(r.body.mensagem).toBe('DESK não é um equipamento de empréstimo.');
  });
  it('equipamento em manutenção não empresta', async () => {
    const { ag, base } = await cenario();
    const m = await db.equipamento.create({ data: { codigo: 'NB-M', tipo: 'Notebook Empréstimo', situacao: 'manutencao' } });
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: m.id }).expect(409);
    expect(r.body.mensagem).toBe('NB-M está em manutenção.');
  });
  it('equipamento ocupado, inclusive em corrida (Foco de revisão 1)', async () => {
    const { ag, nb1, base, t } = await cenario();
    const p2 = await db.pessoa.create({ data: { nome: 'Sol', email: 'sol@suinco.com.br', setorId: t.setorId } });
    const [a, b] = await Promise.all([
      ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }),
      ag.post('/api/emprestimos').send({ ...base, pessoaId: p2.id, equipamentoId: nb1.id }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a.body.mensagem, b.body.mensagem]).toContain('Esse equipamento já está emprestado.');
    expect(await db.emprestimo.count({ where: { equipamentoId: nb1.id, devolvidoEm: null } })).toBe(1);
  });
  it('equipamento já emprestado (sem corrida)', async () => {
    const { ag, nb1, base, t } = await cenario();
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    const p2 = await db.pessoa.create({ data: { nome: 'Sol', email: 'sol@suinco.com.br', setorId: t.setorId } });
    const r = await ag.post('/api/emprestimos').send({ ...base, pessoaId: p2.id, equipamentoId: nb1.id }).expect(409);
    expect(r.body.mensagem).toBe('Esse equipamento já está emprestado.');
  });
  it('limite: 1 por tipo; Master libera a exceção', async () => {
    const { ag, nb1, nb2, base } = await cenario();
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id }).expect(409);
    expect(r.body).toMatchObject({ codigo: 'limite', mensagem: 'Rafa já está com 1 Notebook Empréstimo nesse período (limite: 1).' });
    const r2 = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id, liberarLimite: true }).expect(403);
    expect(r2.body.mensagem).toBe('Só o Administrador Master pode liberar essa exceção.');
    const m = await criarPessoaComAcesso(db, 'master');
    await (await entrarComo(app, m.email)).post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id, liberarLimite: true }).expect(201);
  });
  it('limite personalizado na pessoa', async () => {
    const { ag, nb1, nb2, base, p } = await cenario();
    await db.pessoa.update({ where: { id: p.id }, data: { limites: { 'Notebook Empréstimo': 2 } } });
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id }).expect(201);
  });
  it('atraso: pede confirmação', async () => {
    const { ag, nb1, nb2, base, p } = await cenario();
    await db.pessoa.update({ where: { id: p.id }, data: { limites: { 'Notebook Empréstimo': 5 } } });
    await db.emprestimo.create({ data: { equipamentoId: nb1.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date(Date.now() - 5 * DIA), previsaoEm: new Date(Date.now() - DIA) } });
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id }).expect(409);
    expect(r.body).toMatchObject({ codigo: 'atraso', mensagem: 'Rafa está com equipamento em atraso (NB-1).' });
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb2.id, confirmarAtraso: true }).expect(201);
  });
  it('assinatura obrigatória quando ligada', async () => {
    const { ag, nb1, base } = await cenario();
    const { assinatura, ...sem } = base;
    const r = await ag.post('/api/emprestimos').send({ ...sem, equipamentoId: nb1.id }).expect(400);
    expect(r.body.mensagem).toBe('O colaborador precisa assinar a retirada.');
  });
  it('pessoa desativada não recebe empréstimo', async () => {
    const { ag, nb1, base, p } = await cenario();
    await db.pessoa.update({ where: { id: p.id }, data: { ativo: false } });
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(409);
    expect(r.body.mensagem).toBe('Rafa está desativado.');
  });
  it('técnico precisa ser da TI', async () => {
    const { ag, nb1, base, p } = await cenario();
    const r = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id, tecnicoId: p.id }).expect(400);
    expect(r.body.mensagem).toBe('Escolha um técnico da TI.');
  });
});

describe('devolver e resolver', () => {
  it('acessório não devolvido vira pendência; resolver zera', async () => {
    const { ag, nb1, base } = await cenario();
    const e = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    await ag.post(`/api/emprestimos/${e.body.id}/devolver`).send({ acessoriosDevolvidos: ['Carregador'], assinatura: PNG }).expect(200);
    let d = await ag.get(`/api/emprestimos/${e.body.id}`).expect(200);
    expect(d.body).toMatchObject({ acessoriosFaltando: ['Mouse'], situacao: { txt: 'Devolvido com pendência' } });
    await ag.post(`/api/emprestimos/${e.body.id}/resolver`).send({ acessoriosRecebidos: ['Mouse'] }).expect(200);
    d = await ag.get(`/api/emprestimos/${e.body.id}`);
    expect(d.body).toMatchObject({ acessoriosFaltando: [], acessoriosDevolvidos: ['Carregador', 'Mouse'], situacao: { txt: 'Devolvido' } });
  });
  it('devolver duas vezes: 409', async () => {
    const { ag, nb1, base } = await cenario();
    const e = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id });
    await ag.post(`/api/emprestimos/${e.body.id}/devolver`).send({ acessoriosDevolvidos: ['Carregador', 'Mouse'], assinatura: PNG }).expect(200);
    const r = await ag.post(`/api/emprestimos/${e.body.id}/devolver`).send({ acessoriosDevolvidos: [], assinatura: PNG }).expect(409);
    expect(r.body.mensagem).toBe('Esse empréstimo já foi devolvido.');
  });
  it('depois da devolução o equipamento fica livre de novo', async () => {
    const { ag, nb1, base } = await cenario();
    const e = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id });
    await ag.post(`/api/emprestimos/${e.body.id}/devolver`).send({ acessoriosDevolvidos: ['Carregador', 'Mouse'], assinatura: PNG }).expect(200);
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
  });
});

describe('listas, edição e exclusão', () => {
  it('lista por situação: abertos, atrasados, pendências', async () => {
    const { ag, nb1, nb2, base, p } = await cenario();
    await db.pessoa.update({ where: { id: p.id }, data: { limites: { 'Notebook Empréstimo': 5 } } });
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    await db.emprestimo.create({ data: { equipamentoId: nb2.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date(Date.now() - 3 * DIA), previsaoEm: new Date(Date.now() - DIA) } });
    expect((await ag.get('/api/emprestimos?status=abertos')).body.itens).toHaveLength(2);
    const at = (await ag.get('/api/emprestimos?status=atrasados')).body.itens;
    expect(at.map((e: { equipamento: { codigo: string } }) => e.equipamento.codigo)).toEqual(['NB-2']);
    expect(at[0].situacao.txt).toBe('Atrasado 1 dia');
    expect((await ag.get('/api/emprestimos?status=pendencias')).body.itens).toHaveLength(0);
  });
  it('editar troca a previsão e audita', async () => {
    const { ag, nb1, base } = await cenario();
    const e = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id });
    const nova = new Date(Date.now() + 5 * DIA).toISOString();
    await ag.patch(`/api/emprestimos/${e.body.id}`).send({ previsaoEm: nova }).expect(200);
    expect((await db.emprestimo.findUnique({ where: { id: e.body.id } }))!.previsaoEm!.toISOString()).toBe(nova);
    expect(await db.auditoria.count({ where: { itemId: e.body.id, acao: 'editar' } })).toBe(1);
  });
  it('excluir é lógico e libera o equipamento', async () => {
    const { nb1, base } = await cenario();
    const m = await criarPessoaComAcesso(db, 'master');
    const agM = await entrarComo(app, m.email);
    const e = await agM.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    await agM.delete(`/api/emprestimos/${e.body.id}`).expect(200);
    expect((await db.emprestimo.findUnique({ where: { id: e.body.id } }))!.excluidoEm).not.toBeNull();
    await agM.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
  });
});

describe('portal e contadores', () => {
  it('solicitante vê só os próprios, e nada da lista geral', async () => {
    const { ag, nb1, base } = await cenario();
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id }).expect(201);
    const s = await criarPessoaComAcesso(db, 'solicitante', { email: 'rafa2@suinco.com.br' });
    const agS = await entrarComo(app, s.email);
    await agS.get('/api/emprestimos').expect(403);
    expect((await agS.get('/api/meus-emprestimos').expect(200)).body).toEqual({ emprestimos: [], vinculados: [] });
  });
  it('portal: "Perto de vencer" dentro do aviso configurado (paridade sH)', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar'] });
    const s = await criarPessoaComAcesso(db, 'solicitante');
    const nb = await db.equipamento.create({ data: { codigo: 'NB-P', tipo: 'Notebook Empréstimo' } });
    const cel = await db.equipamento.create({ data: { codigo: 'CEL-P', tipo: 'Celular', pessoaId: s.pessoaId } });
    await db.emprestimo.create({ data: { equipamentoId: nb.id, pessoaId: s.pessoaId, tecnicoId: t.pessoaId, finalidade: 'Viagem', retiradaEm: new Date(), previsaoEm: new Date(Date.now() + 60 * 60_000) } });
    const r = await (await entrarComo(app, s.email)).get('/api/meus-emprestimos').expect(200);
    expect(r.body.emprestimos[0]).toMatchObject({ equipamento: { codigo: 'NB-P' }, situacao: { txt: 'Perto de vencer', cls: 'warn' } });
    expect(r.body.vinculados).toEqual([{ id: cel.id, codigo: 'CEL-P', tipo: 'Celular', modelo: '' }]);
  });
  it('contadores', async () => {
    const { ag, nb1, base } = await cenario();
    await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id, retiradaEm: new Date(Date.now() - 2 * 3600e3).toISOString(), previsaoEm: new Date(Date.now() - 3600e3).toISOString() }).expect(201);
    expect((await ag.get('/api/contadores')).body).toEqual({ atrasados: 1, abertos: 1 });
  });
  it('assinatura da retirada é servida para quem empresta e para o dono do empréstimo', async () => {
    const { ag, nb1, base } = await cenario();
    const e = await ag.post('/api/emprestimos').send({ ...base, equipamentoId: nb1.id });
    await ag.get(`/api/emprestimos/${e.body.id}/assinatura/retirada`).expect(200).expect('Content-Type', /image\/png/);
    const outro = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, outro.email)).get(`/api/emprestimos/${e.body.id}/assinatura/retirada`).expect(403);
  });
});
