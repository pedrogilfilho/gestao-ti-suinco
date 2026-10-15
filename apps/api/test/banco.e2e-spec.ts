import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
beforeAll(async () => { await db.$connect(); });
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE auditoria, ramal, pedido_mensagem, emprestimo, reserva, pedido, equipamento, credencial_local, acesso, grupo_acesso, pessoa, setor, config, tentativa_login CASCADE');
});
afterAll(async () => { await db.$disconnect(); });

describe('banco', () => {
  it('não deixa dois empréstimos abertos no mesmo equipamento', async () => {
    const s = await db.setor.create({ data: { nome: 'TI' } });
    const p = await db.pessoa.create({ data: { nome: 'Ana', email: 'ana@suinco.com.br', setorId: s.id } });
    const e = await db.equipamento.create({ data: { codigo: 'NB-01', tipo: 'Notebook Empréstimo' } });
    const dados = { equipamentoId: e.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date() };
    await db.emprestimo.create({ data: dados });
    await expect(db.emprestimo.create({ data: dados })).rejects.toThrow();
  });

  it('código de equipamento único sem diferenciar maiúsculas, mas liberado após excluir', async () => {
    const a = await db.equipamento.create({ data: { codigo: 'MON-9', tipo: 'Monitor' } });
    await expect(db.equipamento.create({ data: { codigo: 'mon-9', tipo: 'Monitor' } })).rejects.toThrow();
    await db.equipamento.update({ where: { id: a.id }, data: { excluidoEm: new Date() } });
    await expect(db.equipamento.create({ data: { codigo: 'mon-9', tipo: 'Monitor' } })).resolves.toBeTruthy();
  });

  it('e-mail de pessoa único entre as não excluídas', async () => {
    const s = await db.setor.create({ data: { nome: 'TI' } });
    await db.pessoa.create({ data: { nome: 'A', email: 'a@suinco.com.br', setorId: s.id } });
    await expect(db.pessoa.create({ data: { nome: 'B', email: 'a@suinco.com.br', setorId: s.id } })).rejects.toThrow();
  });

  it('módulo 2: tabelas de reservas, pedidos e mensagens com o índice de reservas ativas', async () => {
    const t = await db.$queryRawUnsafe<{ table_name: string }[]>(
      "select table_name from information_schema.tables where table_name in ('reserva','pedido','pedido_mensagem')");
    expect(t.map((x) => x.table_name).sort()).toEqual(['pedido', 'pedido_mensagem', 'reserva']);
    const i = await db.$queryRawUnsafe<{ indexdef: string }[]>("select indexdef from pg_indexes where indexname = 'reserva_ativa_idx'");
    expect(i[0]!.indexdef).toMatch(/WHERE \(\(status = 'ativa'.*excluido_em IS NULL/);
  });

  it('uma reserva vira no máximo um empréstimo', async () => {
    const s = await db.setor.create({ data: { nome: 'TI' } });
    const p = await db.pessoa.create({ data: { nome: 'Ana', email: 'ana@suinco.com.br', setorId: s.id } });
    const e1 = await db.equipamento.create({ data: { codigo: 'NB-01', tipo: 'Notebook Empréstimo' } });
    const e2 = await db.equipamento.create({ data: { codigo: 'NB-02', tipo: 'Notebook Empréstimo' } });
    const r = await db.reserva.create({ data: { equipamentoId: e1.id, pessoaId: p.id, inicioEm: new Date(), fimEm: new Date(Date.now() + 3_600_000) } });
    await db.emprestimo.create({ data: { equipamentoId: e1.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date(), reservaId: r.id } });
    await expect(db.emprestimo.create({ data: { equipamentoId: e2.id, pessoaId: p.id, finalidade: 'Viagem', retiradaEm: new Date(), reservaId: r.id } })).rejects.toThrow();
  });
});
