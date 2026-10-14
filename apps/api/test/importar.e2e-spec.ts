import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { importar } from '../scripts/importar/importar';
import { limparBanco } from './app';

const db = new PrismaClient();
const backup = () => JSON.parse(readFileSync('test/fixtures/backup-exemplo.json', 'utf8'));
beforeAll(async () => { await db.$connect(); });
beforeEach(async () => limparBanco(db));
afterAll(async () => { await db.$disconnect(); });

describe('importar', () => {
  it('ensaio não grava nada e devolve o relatório', async () => {
    const rel = await importar(db, backup(), { ensaio: true });
    expect(rel.criados).toMatchObject({ pessoas: 4, acessos: 3, equipamentos: 4, emprestimos: 2, grupos: 1 });
    expect(rel.ignorados).toEqual([{ area: 'emprestimos', id: 'EMP-0099', motivo: 'pessoa ninguem@suinco.com.br não está no backup' }]);
    expect(await db.pessoa.count()).toBe(0);
    expect(await db.auditoria.count()).toBe(0);
  });

  it('de verdade: liga empréstimo, pessoa, técnico e equipamento por chave', async () => {
    const rel = await importar(db, backup(), { ensaio: false });
    const aberto = await db.emprestimo.findFirstOrThrow({ where: { devolvidoEm: null }, include: { pessoa: true, tecnico: true, equipamento: true } });
    expect(aberto).toMatchObject({ chamadoGlpi: '43150', pessoa: { email: 'ana.souza@suinco.com.br' }, tecnico: { email: 'tec@suinco.com.br' }, equipamento: { codigo: 'NB-01', tipo: 'Notebook Empréstimo' } });
    expect(aberto.retiradaEm.toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(aberto.assinaturaRetiradaUrl).toMatch(/^assinaturas\//);
    const devolvido = await db.emprestimo.findFirstOrThrow({ where: { devolvidoEm: { not: null } } });
    expect(devolvido).toMatchObject({ acessoriosFaltando: ['Mouse'], assinaturaRetiradaUrl: null });
    expect(rel.avisos.some((a) => a.includes('EMP-0000'))).toBe(true);
    // importação não polui a auditoria: um único registro, o da própria importação
    expect(await db.auditoria.count({ where: { NOT: { itemId: 'importacao' } } })).toBe(0);
    expect(await db.auditoria.count({ where: { area: 'config', itemId: 'importacao' } })).toBe(1);
  });

  it('acessos, grupos, regras de permissão e pessoa que só existia em Acessos', async () => {
    await importar(db, backup(), { ensaio: false });
    const tec = await db.acesso.findFirstOrThrow({ where: { pessoa: { email: 'tec@suinco.com.br' } } });
    expect(tec).toMatchObject({ papel: 'tic', permissoes: { emprestar: true, equipamentos: true, almoxarifado: true, auditoria: true } });
    const ana = await db.acesso.findFirstOrThrow({ where: { pessoa: { email: 'ana.souza@suinco.com.br' } }, include: { grupo: true } });
    expect(ana.grupo).toMatchObject({ nome: 'Suporte N1', permissoes: { emprestar: true, reservar: true } });
    const dono = await db.pessoa.findFirstOrThrow({ where: { email: 'dono@suinco.com.br' }, include: { acesso: { include: { credencial: true } }, setor: true } });
    expect(dono).toMatchObject({ nome: 'Dono do App', setor: { nome: 'TI' }, acesso: { papel: 'master', credencial: { trocarNoProximoLogin: true } } });
  });

  it('dono recebe senha temporária no relatório; os outros entram depois pela tela de Acessos', async () => {
    const rel = await importar(db, backup(), { ensaio: false });
    expect(rel.senhasDonos).toEqual([{ email: 'dono@suinco.com.br', senha: expect.stringMatching(/^[A-Za-z]{6}\d{2}$/) }]);
    expect(await db.credencialLocal.count()).toBe(1);
  });

  it('equipamentos: vínculo por e-mail e por nome, centro de custo, campos antigos em obs', async () => {
    await importar(db, backup(), { ensaio: false });
    const eq = Object.fromEntries((await db.equipamento.findMany({ include: { pessoa: true, setor: true } })).map((e) => [e.codigo, e]));
    expect(eq['CEL-01']).toMatchObject({ pessoa: { email: 'ana.souza@suinco.com.br' }, numeroCorp: '(34) 99999-0001' });
    expect(eq['CEL-OLD']).toMatchObject({ pessoa: { email: 'beto@suinco.com.br' } });
    expect(eq['CEL-OLD']!.obs).toContain('responsavel: Fulano');
    expect(eq['DESK-01']).toMatchObject({ setor: { nome: 'TI' }, ip: '10.0.0.9', termoStatus: 'assinado' });
  });

  it('pessoas: e-mail normalizado, setor inexistente, limites com o tipo novo, foto e assinatura', async () => {
    await importar(db, backup(), { ensaio: false });
    const p = Object.fromEntries((await db.pessoa.findMany({ include: { setor: true } })).map((x) => [x.email, x]));
    expect(p['ana.souza@suinco.com.br']).toMatchObject({ telefoneCorp: '(34) 99999-0001', setor: { nome: 'Financeiro' } });
    expect(p['ana.souza@suinco.com.br']!.fotoUrl).toMatch(/^fotos\/.+\.jpg$/);
    expect(p['beto@suinco.com.br']).toMatchObject({ setor: { nome: '(sem setor)' }, limites: { 'Notebook Empréstimo': 2 } });
    expect(p['tec@suinco.com.br']!.assinaturaUrl).toMatch(/^assinaturas\//);
  });

  it('configuração: só as chaves do núcleo, tipo antigo renomeado', async () => {
    await importar(db, backup(), { ensaio: false });
    const c = await db.config.findUniqueOrThrow({ where: { chave: 'nucleo' } });
    expect(c.valor).toMatchObject({ tiposEmprestaveis: ['Notebook Empréstimo'], glpiUrl: 'https://glpi.suinco.test/ticket?id=', avisoMin: 90 });
    expect(c.valor).not.toHaveProperty('expOn');
  });

  it('recusa banco que já tem dados', async () => {
    await db.setor.create({ data: { nome: 'Já existe' } });
    await expect(importar(db, backup(), { ensaio: false })).rejects.toThrow('O banco já tem dados. A importação é feita num banco vazio.');
  });

  it('arquivo que não é backup do sistema', async () => {
    await expect(importar(db, { qualquer: 1 }, { ensaio: true })).rejects.toThrow('Esse arquivo não parece um backup do sistema (faltam usuarios e equipamentos).');
  });
});
