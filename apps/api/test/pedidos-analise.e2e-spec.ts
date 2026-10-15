import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, PNG } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const H = 3_600_000, DIA = 24 * H;
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const em = (dias: number, hm: string) => new Date(`${diaSP(new Date(Date.now() + dias * DIA))}T${hm}:00-03:00`);

async function cenario() {
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['reservar', 'emprestar'] });
  const at = await entrarComo(app, t.email);
  const s = await criarPessoaComAcesso(db, 'solicitante', { setorNome: 'Comercial' });
  await db.pessoa.update({ where: { id: s.pessoaId }, data: { nome: 'Caio Prado', telefoneCorp: '(34) 99999-0000' } });
  const nb1 = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const nb2 = await db.equipamento.create({ data: { codigo: 'NB-2', tipo: 'Notebook Empréstimo' } });
  const pedido = (x: Record<string, unknown> = {}, pessoaId = s.pessoaId) => db.pedido.create({
    data: { pessoaId, tipo: 'Notebook Empréstimo', finalidade: 'Viagem', chamadoGlpi: '50', retiradaEm: em(1, '09:00'), devolucaoEm: em(1, '17:00'), ...x },
  });
  const aprovar = (id: string, x: Record<string, unknown> = {}) => at.post(`/api/pedidos/${id}/aprovar`)
    .send({ equipamentoId: nb1.id, retiradaEm: em(1, '09:00').toISOString(), devolucaoEm: em(1, '17:00').toISOString(), ...x });
  return { t, at, s, nb1, nb2, pedido, aprovar };
}
const msgs = (pedidoId: string) => db.pedidoMensagem.findMany({ where: { pedidoId }, orderBy: { em: 'asc' } }).then((l) => l.map((m) => [m.de, m.texto]));

describe('análise de pedidos', () => {
  it('aprovar e reservar: cria a reserva, aprova o pedido e avisa na conversa', async () => {
    const { at, pedido, aprovar } = await cenario();
    const p = await pedido();
    await aprovar(p.id, { mensagem: 'Retire na sala da TI' }).expect(200);
    const depois = await db.pedido.findUnique({ where: { id: p.id }, include: { reserva: true, equipamento: true } });
    expect(depois).toMatchObject({ status: 'aprovado', mensagemTi: 'Retire na sala da TI' });
    expect(depois!.equipamento!.codigo).toBe('NB-1');
    expect(depois!.reserva!.status).toBe('ativa');
    expect(await msgs(p.id)).toEqual([['sistema', 'Pedido aprovado. NB-1 reservado.'], ['ti', 'Retire na sala da TI']]);
    const l = (await at.get('/api/pedidos?status=aprovados').expect(200)).body.itens;
    expect(l).toHaveLength(1);
  });
  it('pedido já tratado ou cancelado: 409', async () => {
    const { pedido, aprovar } = await cenario();
    const p = await pedido();
    await aprovar(p.id).expect(200);
    expect((await aprovar(p.id).expect(409)).body.mensagem).toBe('Este pedido já foi tratado (aprovado).');
    const c = await pedido({ status: 'cancelado' });
    expect((await aprovar(c.id).expect(409)).body.mensagem).toBe('O colaborador cancelou este pedido.');
  });
  it('equipamento ocupado no período: 409 conflito', async () => {
    const { s, nb1, pedido, aprovar } = await cenario();
    const outra = await db.pessoa.create({ data: { nome: 'Ana', email: 'ana@suinco.com.br', setorId: (await db.pessoa.findUnique({ where: { id: s.pessoaId } }))!.setorId } });
    await db.reserva.create({ data: { equipamentoId: nb1.id, pessoaId: outra.id, inicioEm: em(1, '08:00'), fimEm: em(1, '12:00') } });
    const p = await pedido();
    expect((await aprovar(p.id).expect(409)).body.codigo).toBe('conflito');
  });
  it('atualizar o telefone do cadastro na aprovação', async () => {
    const { s, pedido, aprovar } = await cenario();
    const p = await pedido({ telefoneCorp: '(34) 98888-1111' });
    await aprovar(p.id, { atualizarTelefone: true }).expect(200);
    expect((await db.pessoa.findUnique({ where: { id: s.pessoaId } }))!.telefoneCorp).toBe('(34) 98888-1111');
  });
  it('entregar agora: o empréstimo marca o pedido como entregue', async () => {
    const { at, s, nb1, pedido } = await cenario();
    const p = await pedido({ urgente: true, justificativa: 'Já', finalidade: 'Urgência', retiradaEm: new Date(), devolucaoEm: null });
    const e = await at.post('/api/emprestimos').send({
      equipamentoId: nb1.id, pessoaId: s.pessoaId, finalidade: 'Viagem', retiradaEm: new Date().toISOString(),
      previsaoEm: new Date(Date.now() + 4 * H).toISOString(), assinatura: PNG, pedidoId: p.id,
    }).expect(201);
    const depois = await db.pedido.findUnique({ where: { id: p.id }, include: { emprestimo: true } });
    expect(depois!.status).toBe('entregue');
    expect(depois!.emprestimo!.id).toBe(e.body.id);
    expect(await msgs(p.id)).toEqual([['sistema', 'Pedido aprovado e entregue: NB-1.']]);
  });
  it('recusar: Outro exige detalhe; o motivo fica no pedido e na conversa', async () => {
    const { at, pedido } = await cenario();
    const p = await pedido();
    expect((await at.post(`/api/pedidos/${p.id}/recusar`).send({ motivo: 'Outro' }).expect(400)).body.mensagem).toBe('Descreva o motivo.');
    await at.post(`/api/pedidos/${p.id}/recusar`).send({ motivo: 'Pedido sem autorização do gestor', detalhe: 'Fale com o gestor' }).expect(200);
    expect(await db.pedido.findUnique({ where: { id: p.id } })).toMatchObject({ status: 'recusado', motivoRecusa: 'Pedido sem autorização do gestor. Fale com o gestor' });
    expect(await msgs(p.id)).toEqual([['sistema', 'Pedido recusado.'], ['ti', 'Pedido sem autorização do gestor. Fale com o gestor']]);
  });
  it('sem equipamento: aparece no filtro e o aviso vai pela conversa', async () => {
    const { at, s, nb1, nb2, pedido } = await cenario();
    const ana = await db.pessoa.create({ data: { nome: 'Ana', email: 'ana@suinco.com.br', setorId: (await db.pessoa.findUnique({ where: { id: s.pessoaId } }))!.setorId } });
    for (const eq of [nb1, nb2]) await db.reserva.create({ data: { equipamentoId: eq.id, pessoaId: ana.id, inicioEm: em(1, '08:00'), fimEm: em(1, '18:00') } });
    const p = await pedido();
    const l = (await at.get('/api/pedidos?status=semequip').expect(200)).body.itens as { id: string; semEquipamento: boolean }[];
    expect(l.map((x) => [x.id, x.semEquipamento])).toEqual([[p.id, true]]);
    await at.post(`/api/pedidos/${p.id}/avisar-sem-equipamento`).expect(200);
    const [m] = await msgs(p.id);
    expect(m![1]).toMatch(/^Olá, Caio! Todos os equipamentos de Notebook Empréstimo já estão agendados para o período pedido \(.+ até .+\)\. Podemos combinar outro dia ou horário\? Responda por aqui\.$/);
    expect((await db.pedido.findUnique({ where: { id: p.id } }))!.semEquipAvisadoEm).not.toBeNull();
  });
  it('aprovar em lote: equipamentos diferentes no mesmo horário; o que sobra fica pendente', async () => {
    const { at, s, pedido } = await cenario();
    const setorId = (await db.pessoa.findUnique({ where: { id: s.pessoaId } }))!.setorId;
    const outras = await Promise.all(['ana', 'bia'].map((n) => db.pessoa.create({ data: { nome: n.toUpperCase(), email: `${n}@suinco.com.br`, setorId } })));
    const ps = [await pedido(), await pedido({}, outras[0]!.id), await pedido({}, outras[1]!.id)];
    const r = (await at.post('/api/pedidos/aprovar-lote').send({ ids: ps.map((p) => p.id) }).expect(200)).body;
    expect(r.aprovados).toHaveLength(2);
    expect(new Set(r.aprovados.map((a: { equipamento: string }) => a.equipamento))).toEqual(new Set(['NB-1', 'NB-2']));
    expect(r.pendentes).toHaveLength(1);
    expect(r.pendentes[0].motivo).toMatch(/: sem Notebook Empréstimo livre nesse período$/);
  });
  it('lote deixa pendente quem está em atraso', async () => {
    const { at, s, nb2, pedido } = await cenario();
    await db.emprestimo.create({ data: { equipamentoId: nb2.id, pessoaId: s.pessoaId, finalidade: 'Viagem', retiradaEm: new Date(Date.now() - 3 * DIA), previsaoEm: new Date(Date.now() - DIA) } });
    const p = await pedido();
    const r = (await at.post('/api/pedidos/aprovar-lote').send({ ids: [p.id] }).expect(200)).body;
    expect(r.pendentes).toEqual([{ id: p.id, nome: 'Caio Prado', motivo: 'Caio Prado: está com equipamento em atraso' }]);
  });
  it('retirada da reserva vinda de pedido marca o pedido como entregue', async () => {
    const { at, s, nb1, pedido } = await cenario();
    const p = await pedido({ retiradaEm: new Date(Date.now() + 5 * 60_000), devolucaoEm: new Date(Date.now() + DIA) });
    await at.post(`/api/pedidos/${p.id}/aprovar`).send({ equipamentoId: nb1.id, retiradaEm: new Date(Date.now() + 5 * 60_000).toISOString(), devolucaoEm: new Date(Date.now() + DIA).toISOString() }).expect(200);
    const r = await db.reserva.findFirst({ where: { pedidoId: p.id } });
    await at.post('/api/emprestimos').send({
      equipamentoId: nb1.id, pessoaId: s.pessoaId, finalidade: 'Viagem', retiradaEm: new Date().toISOString(),
      previsaoEm: new Date(Date.now() + DIA).toISOString(), assinatura: PNG, reservaId: r!.id,
    }).expect(201);
    expect((await db.pedido.findUnique({ where: { id: p.id } }))!.status).toBe('entregue');
  });
  it('lista: pendentes inclui o que tem mensagem nova; urgentes primeiro; busca por setor', async () => {
    const { at, pedido } = await cenario();
    const normal = await pedido();
    const urg = await pedido({ urgente: true, justificativa: 'Agora', retiradaEm: new Date(), devolucaoEm: null });
    const aprovadoComMsg = await pedido({ status: 'aprovado', ultimaDe: 'colab' });
    const l = (await at.get('/api/pedidos?status=pendentes').expect(200)).body.itens.map((x: { id: string }) => x.id);
    expect(l).toEqual([urg.id, normal.id, aprovadoComMsg.id]);
    expect((await at.get('/api/pedidos?status=todos&q=comercial').expect(200)).body.itens).toHaveLength(3);
  });
  it('permissões: consulta vê e não aprova; solicitante não lista; excluir é do Master', async () => {
    const { pedido } = await cenario();
    const p = await pedido();
    const c = await criarPessoaComAcesso(db, 'consulta');
    const ac = await entrarComo(app, c.email);
    await ac.get('/api/pedidos').expect(200);
    await ac.post(`/api/pedidos/${p.id}/recusar`).send({ motivo: 'Outro', detalhe: 'x' }).expect(403);
    const sol = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, sol.email)).get('/api/pedidos').expect(403);
    const m = await criarPessoaComAcesso(db, 'master');
    await (await entrarComo(app, m.email)).delete(`/api/pedidos/${p.id}`).expect(200);
    expect((await db.pedido.findUnique({ where: { id: p.id } }))!.excluidoEm).not.toBeNull();
  });
});
