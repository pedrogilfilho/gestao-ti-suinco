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
const em = (dias: number, h: number) => new Date(`${diaSP(new Date(Date.now() + dias * DIA))}T${String(h).padStart(2, '0')}:00:00-03:00`);

async function cenario() {
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar', 'reservar'] });
  const ag = await entrarComo(app, t.email);
  const ana = await db.pessoa.create({ data: { nome: 'Ana Reis', email: 'ana@suinco.com.br', setorId: t.setorId } });
  const bia = await db.pessoa.create({ data: { nome: 'Bia Lima', email: 'bia@suinco.com.br', setorId: t.setorId } });
  const nb = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const nb2 = await db.equipamento.create({ data: { codigo: 'NB-2', tipo: 'Notebook Empréstimo' } });
  const corpo = (x: Record<string, unknown> = {}) => ({
    pessoaId: ana.id, equipamentoId: nb.id, inicioEm: em(1, 8).toISOString(), fimEm: em(1, 12).toISOString(), finalidade: 'Treinamento', ...x,
  });
  return { t, ag, ana, bia, nb, nb2, corpo };
}
type Item = { id: string; equipamento: { codigo: string }; pessoa: { nome: string }; situacao: { txt: string } };
const listar = async (ag: Awaited<ReturnType<typeof entrarComo>>, q: string) => (await ag.get(`/api/reservas?${q}`).expect(200)).body.itens as Item[];

describe('reservas', () => {
  it('cria, audita e aparece em Próximas; em Hoje só as de hoje', async () => {
    const { ag, corpo } = await cenario();
    const r = await ag.post('/api/reservas').send(corpo()).expect(201);
    expect(await db.auditoria.count({ where: { area: 'reservas', itemId: r.body.id, acao: 'criar' } })).toBe(1);
    const prox = await listar(ag, 'status=proximas');
    expect(prox.map((x) => [x.equipamento.codigo, x.pessoa.nome, x.situacao.txt])).toEqual([['NB-1', 'Ana Reis', 'Reservada']]);
    expect(await listar(ag, 'status=hoje')).toHaveLength(0);
  });
  it('Próximas é a lista padrão e vem em ordem de início', async () => {
    const { ag, corpo, nb2 } = await cenario();
    await ag.post('/api/reservas').send(corpo({ inicioEm: em(2, 8).toISOString(), fimEm: em(2, 9).toISOString() })).expect(201);
    await ag.post('/api/reservas').send(corpo({ equipamentoId: nb2.id, pessoaId: (await db.pessoa.findFirst({ where: { nome: 'Bia Lima' } }))!.id })).expect(201);
    expect((await listar(ag, '')).map((x) => x.equipamento.codigo)).toEqual(['NB-2', 'NB-1']);
  });
  it('Histórico tem a cancelada e a não retirada', async () => {
    const { ag, ana, nb, nb2, corpo } = await cenario();
    const r = await ag.post('/api/reservas').send(corpo()).expect(201);
    await ag.post(`/api/reservas/${r.body.id}/cancelar`).expect(200);
    await db.reserva.create({ data: { equipamentoId: nb2.id, pessoaId: ana.id, inicioEm: em(-1, 8), fimEm: em(-1, 12) } });
    const h = await listar(ag, 'status=historico');
    expect(h.map((x) => x.situacao.txt).sort()).toEqual(['Cancelada', 'Não retirada']);
    expect(await listar(ag, 'status=proximas')).toHaveLength(0);
    void nb;
  });
  it('data passada e fim antes do início são recusados', async () => {
    const { ag, corpo } = await cenario();
    expect((await ag.post('/api/reservas').send(corpo({ inicioEm: em(-1, 8).toISOString(), fimEm: em(-1, 9).toISOString() })).expect(400)).body.mensagem)
      .toBe('A data da reserva já passou.');
    expect((await ag.post('/api/reservas').send(corpo({ fimEm: em(1, 7).toISOString() })).expect(400)).body.mensagem)
      .toBe('O horário final precisa ser depois do inicial.');
  });
  it('conflito com outra reserva', async () => {
    const { ag, bia, corpo } = await cenario();
    await ag.post('/api/reservas').send(corpo()).expect(201);
    const r = await ag.post('/api/reservas').send(corpo({ pessoaId: bia.id, inicioEm: em(1, 11).toISOString(), fimEm: em(1, 13).toISOString() })).expect(409);
    expect(r.body).toMatchObject({ codigo: 'conflito', mensagem: 'Conflito: NB-1 já está reservado para Ana Reis das 08:00 às 12:00.' });
  });
  it('atraso bloqueia o técnico; o Master libera', async () => {
    const { ag, ana, nb2, corpo } = await cenario();
    await db.emprestimo.create({ data: { equipamentoId: nb2.id, pessoaId: ana.id, finalidade: 'Viagem', retiradaEm: new Date(Date.now() - 3 * DIA), previsaoEm: new Date(Date.now() - DIA) } });
    const r = await ag.post('/api/reservas').send(corpo()).expect(409);
    expect(r.body).toMatchObject({ codigo: 'atraso', mensagem: 'Ana Reis está com equipamento em atraso (NB-2). Novas reservas ficam bloqueadas até a devolução.' });
    await ag.post('/api/reservas').send(corpo({ liberarAtraso: true })).expect(403);
    const m = await criarPessoaComAcesso(db, 'master');
    await (await entrarComo(app, m.email)).post('/api/reservas').send(corpo({ liberarAtraso: true })).expect(201);
  });
  it('limite: segunda reserva no mesmo período', async () => {
    const { ag, nb2, corpo } = await cenario();
    await ag.post('/api/reservas').send(corpo()).expect(201);
    const r = await ag.post('/api/reservas').send(corpo({ equipamentoId: nb2.id })).expect(409);
    expect(r.body).toMatchObject({ codigo: 'limite', mensagem: 'Ana Reis já está com 1 Notebook Empréstimo nesse período (limite: 1).' });
  });
  it('editar para um horário ocupado recusa; editar a própria não conflita consigo', async () => {
    const { ag, bia, nb2, corpo } = await cenario();
    const a = await ag.post('/api/reservas').send(corpo()).expect(201);
    await ag.post('/api/reservas').send(corpo({ pessoaId: bia.id, equipamentoId: nb2.id })).expect(201);
    await ag.patch(`/api/reservas/${a.body.id}`).send(corpo({ fimEm: em(1, 13).toISOString() })).expect(200);
    await ag.patch(`/api/reservas/${a.body.id}`).send(corpo({ equipamentoId: nb2.id })).expect(409);
  });
  it('registrar retirada: o empréstimo marca a reserva como retirada', async () => {
    const { ag, ana, nb } = await cenario();
    const r = await db.reserva.create({ data: { equipamentoId: nb.id, pessoaId: ana.id, inicioEm: new Date(), fimEm: new Date(Date.now() + 2 * DIA) } });
    const e = await ag.post('/api/emprestimos').send({
      equipamentoId: nb.id, pessoaId: ana.id, finalidade: 'Viagem', retiradaEm: new Date().toISOString(),
      previsaoEm: new Date(Date.now() + 2 * DIA).toISOString(), assinatura: PNG, reservaId: r.id,
    }).expect(201);
    const depois = await db.reserva.findUnique({ where: { id: r.id }, include: { emprestimo: true } });
    expect(depois!.status).toBe('retirada');
    expect(depois!.emprestimo!.id).toBe(e.body.id);
    const h = await listar(ag, 'status=historico');
    expect(h[0]!.situacao.txt).toBe('Retirada (empréstimo)');
  });
  it('retirada de reserva cancelada é recusada', async () => {
    const { ag, ana, nb } = await cenario();
    const r = await db.reserva.create({ data: { equipamentoId: nb.id, pessoaId: ana.id, inicioEm: new Date(), fimEm: new Date(Date.now() + DIA), status: 'cancelada' } });
    const x = await ag.post('/api/emprestimos').send({
      equipamentoId: nb.id, pessoaId: ana.id, finalidade: 'Viagem', retiradaEm: new Date().toISOString(),
      previsaoEm: new Date(Date.now() + DIA).toISOString(), assinatura: PNG, reservaId: r.id,
    }).expect(409);
    expect(x.body.mensagem).toBe('Essa reserva não está mais ativa.');
  });
  it('excluir é do Master e restaura pela Auditoria', async () => {
    const { ag, corpo } = await cenario();
    const r = await ag.post('/api/reservas').send(corpo()).expect(201);
    await ag.delete(`/api/reservas/${r.body.id}`).expect(403);
    const m = await criarPessoaComAcesso(db, 'master');
    const am = await entrarComo(app, m.email);
    await am.delete(`/api/reservas/${r.body.id}`).expect(200);
    expect(await listar(ag, 'status=todas')).toHaveLength(0);
    const reg = await db.auditoria.findFirst({ where: { area: 'reservas', acao: 'excluir' } });
    await am.post(`/api/auditoria/${reg!.id}/restaurar`).expect(200);
    expect(await listar(ag, 'status=todas')).toHaveLength(1);
  });
  it('busca por e-mail; consulta e solicitante não criam', async () => {
    const { ag, corpo } = await cenario();
    await ag.post('/api/reservas').send(corpo()).expect(201);
    expect(await listar(ag, 'q=ana@suinco')).toHaveLength(1);
    expect(await listar(ag, 'q=bia@suinco')).toHaveLength(0);
    const c = await criarPessoaComAcesso(db, 'consulta');
    const ac = await entrarComo(app, c.email);
    await ac.get('/api/reservas').expect(200);
    await ac.post('/api/reservas').send(corpo()).expect(403);
    const s = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, s.email)).get('/api/reservas').expect(403);
  });
});
