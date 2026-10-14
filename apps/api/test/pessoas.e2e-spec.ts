import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, PNG } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const tic = () => criarPessoaComAcesso(db, 'tic', { permissoes: ['usuarios'] });

describe('cadastro', () => {
  it('e-mail com maiúsculas casa com o existente (Foco de revisão 5)', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await ag.post('/api/pessoas').send({ nome: 'Bia', email: 'bia@suinco.com.br', setorId: t.setorId }).expect(201);
    const r = await ag.post('/api/pessoas').send({ nome: 'Bia 2', email: ' BIA@Suinco.com.br', setorId: t.setorId }).expect(409);
    expect(r.body.mensagem).toBe('Já existe usuário com esse e-mail.');
  });
  it('e-mail sem domínio é completado', async () => {
    const t = await tic();
    const r = await (await entrarComo(app, t.email)).post('/api/pessoas').send({ nome: 'Lia', email: 'lia.souza', setorId: t.setorId }).expect(201);
    expect(r.body.email).toBe('lia.souza@suinco.com.br');
  });
  it('setor precisa existir e não estar excluído', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const s = await db.setor.create({ data: { nome: 'Velho', excluidoEm: new Date() } });
    const r = await ag.post('/api/pessoas').send({ nome: 'C', email: 'c@suinco.com.br', setorId: s.id }).expect(400);
    expect(r.body).toEqual({ mensagem: 'Selecione o setor.', campo: 'setorId' });
  });
  it('assinatura só para técnico da TI', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const r = await ag.post('/api/pessoas').send({ nome: 'D', email: 'd@suinco.com.br', setorId: t.setorId, assinatura: PNG }).expect(400);
    expect(r.body.mensagem).toBe('Só técnicos da TI têm assinatura salva.');
    await ag.patch(`/api/pessoas/${t.pessoaId}`).send({ nome: t.email, setorId: t.setorId, assinatura: PNG }).expect(200);
    expect((await db.pessoa.findUnique({ where: { id: t.pessoaId } }))!.assinaturaUrl).toMatch(/^assinaturas\//);
  });
  it('limites só na edição e entre 1 e 50', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const p = await db.pessoa.create({ data: { nome: 'H', email: 'h@suinco.com.br', setorId: t.setorId } });
    await ag.patch(`/api/pessoas/${p.id}`).send({ nome: 'H', setorId: t.setorId, limites: { 'Notebook Empréstimo': 99 } }).expect(400);
    await ag.patch(`/api/pessoas/${p.id}`).send({ nome: 'H', setorId: t.setorId, limites: { 'Notebook Empréstimo': 2 } }).expect(200);
    expect((await db.pessoa.findUnique({ where: { id: p.id } }))!.limites).toEqual({ 'Notebook Empréstimo': 2 });
  });
});

describe('lista e busca', () => {
  it('vários termos: todos precisam bater, em nome, e-mail ou setor (paridade sL)', async () => {
    const t = await tic();
    const rh = await db.setor.create({ data: { nome: 'RH' } });
    await db.pessoa.create({ data: { nome: 'Ana Souza', email: 'ana.souza@suinco.com.br', setorId: rh.id } });
    await db.pessoa.create({ data: { nome: 'Ana Lima', email: 'ana.lima@suinco.com.br', setorId: t.setorId } });
    const r = await (await entrarComo(app, t.email)).get('/api/pessoas?q=rh ana').expect(200);
    expect(r.body.itens.map((p: { nome: string }) => p.nome)).toEqual(['Ana Souza']);
  });
  it('item da lista diz se o Excluir está travado e por quê', async () => {
    const t = await tic();
    const p = await db.pessoa.create({ data: { nome: 'Davi', email: 'davi@suinco.com.br', setorId: t.setorId } });
    await db.equipamento.create({ data: { codigo: 'CEL-1', tipo: 'Celular', pessoaId: p.id } });
    const r = await (await entrarComo(app, t.email)).get('/api/pessoas?q=davi').expect(200);
    expect(r.body.itens[0]).toMatchObject({ nome: 'Davi', exclusaoTravada: 'Davi está com CEL-1 vinculado. Desvincule antes de excluir.', equipamentos: [{ codigo: 'CEL-1' }] });
  });
});

describe('excluir e desativar', () => {
  it('excluir travado com equipamento vinculado, com o motivo', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const ag = await entrarComo(app, m.email);
    const p = await db.pessoa.create({ data: { nome: 'Davi', email: 'davi@suinco.com.br', setorId: m.setorId } });
    await db.equipamento.create({ data: { codigo: 'CEL-1', tipo: 'Celular', pessoaId: p.id } });
    const r = await ag.delete(`/api/pessoas/${p.id}`).expect(409);
    expect(r.body.mensagem).toBe('Davi está com CEL-1 vinculado. Desvincule antes de excluir.');
  });
  it('excluir travado com empréstimo aberto', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const p = await db.pessoa.create({ data: { nome: 'Eva', email: 'eva@suinco.com.br', setorId: m.setorId } });
    const e = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
    await db.emprestimo.create({ data: { equipamentoId: e.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date() } });
    const r = await (await entrarComo(app, m.email)).delete(`/api/pessoas/${p.id}`).expect(409);
    expect(r.body.mensagem).toBe('Eva está com NB-1 emprestado. Registre a devolução antes de excluir.');
  });
  it('excluir de verdade: exclusão lógica e acesso suspenso', async () => {
    const m = await criarPessoaComAcesso(db, 'master');
    const t = await tic();
    await (await entrarComo(app, m.email)).delete(`/api/pessoas/${t.pessoaId}`).expect(200);
    expect((await db.pessoa.findUnique({ where: { id: t.pessoaId } }))!.excluidoEm).not.toBeNull();
    expect((await db.acesso.findUnique({ where: { id: t.acessoId } }))!.suspenso).toBe(true);
  });
  it('desativar em lote não exclui e solta os equipamentos vinculados (paridade sV4)', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    const p = await db.pessoa.create({ data: { nome: 'E', email: 'e@suinco.com.br', setorId: t.setorId } });
    const eq = await db.equipamento.create({ data: { codigo: 'CEL-9', tipo: 'Celular', pessoaId: p.id, vinculadoEm: new Date() } });
    await ag.post('/api/pessoas/desativar').send({ ids: [p.id] }).expect(200);
    expect(await db.pessoa.findUnique({ where: { id: p.id } })).toMatchObject({ ativo: false, excluidoEm: null });
    expect(await db.equipamento.findUnique({ where: { id: eq.id } })).toMatchObject({ pessoaId: null, vinculadoEm: null });
  });
});

describe('colar lista (paridade sY)', () => {
  it('grava as válidas, ignora repetidas na lista e avisa quem já existe', async () => {
    const t = await tic();
    const ag = await entrarComo(app, t.email);
    await db.pessoa.create({ data: { nome: 'Velha', email: 'velha@suinco.com.br', setorId: t.setorId } });
    const r = await ag.post('/api/pessoas/lote').send({ linhas: [
      { email: 'f', nome: 'F', setor: 'TI' },
      { email: 'g@gmail.com', nome: 'G', setor: 'TI' },
      { email: 'f@suinco.com.br', nome: 'F de novo', setor: 'TI' },
      { email: 'h@suinco.com.br', nome: 'H', setor: 'Inexistente' },
      { email: 'velha@suinco.com.br', nome: 'Velha', setor: 'ti' },
    ] }).expect(200);
    expect(r.body).toEqual({ criados: 1, erros: [
      { linha: 2, mensagem: 'O e-mail precisa terminar em @suinco.com.br.' },
      { linha: 3, mensagem: 'E-mail repetido na lista (linha 1).' },
      { linha: 4, mensagem: 'Setor "Inexistente" não está cadastrado. Cadastre o setor primeiro.' },
      { linha: 5, mensagem: 'Já estava cadastrado.' },
    ] });
  });
  it('perfil só é aplicado por quem gerencia acessos', async () => {
    const t = await tic();
    await (await entrarComo(app, t.email)).post('/api/pessoas/lote').send({ linhas: [{ email: 'i', nome: 'I', setor: 'TI', perfil: 'tic' }] }).expect(200);
    expect(await db.acesso.count({ where: { pessoa: { email: 'i@suinco.com.br' } } })).toBe(0);
    const m = await criarPessoaComAcesso(db, 'master');
    await (await entrarComo(app, m.email)).post('/api/pessoas/lote').send({ linhas: [{ email: 'j', nome: 'J', setor: 'TI', perfil: 'solicitante' }] }).expect(200);
    expect(await db.acesso.findFirst({ where: { pessoa: { email: 'j@suinco.com.br' } }, include: { credencial: true } })).toMatchObject({ papel: 'solicitante', credencial: { trocarNoProximoLogin: true } });
  });
});

describe('foto (paridade sP)', () => {
  it('a própria pessoa troca a sua foto; outra pessoa sem permissão não vê', async () => {
    const s = await criarPessoaComAcesso(db, 'solicitante');
    const ag = await entrarComo(app, s.email);
    await ag.post('/api/pessoas/minha-foto').send({ foto: PNG }).expect(200);
    await ag.get(`/api/pessoas/${s.pessoaId}/foto`).expect(200).expect('Content-Type', /image\/png/);
    const outro = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, outro.email)).get(`/api/pessoas/${s.pessoaId}/foto`).expect(403);
  });
  it('apagar a foto', async () => {
    const s = await criarPessoaComAcesso(db, 'solicitante');
    const ag = await entrarComo(app, s.email);
    await ag.post('/api/pessoas/minha-foto').send({ foto: PNG });
    await ag.post('/api/pessoas/minha-foto').send({ apagarFoto: true }).expect(200);
    await ag.get(`/api/pessoas/${s.pessoaId}/foto`).expect(404);
  });
});
