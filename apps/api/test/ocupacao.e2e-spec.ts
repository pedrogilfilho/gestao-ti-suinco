import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, PNG } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const H = 3_600_000, DIA = 24 * H;
// amanhã às HH:00 de Brasília
const amanha = (h: number) => {
  const d = new Date(Date.now() + DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${d}T${String(h).padStart(2, '0')}:00:00-03:00`);
};

async function cenario() {
  const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['emprestar', 'reservar'] });
  const ag = await entrarComo(app, t.email);
  const ana = await db.pessoa.create({ data: { nome: 'Ana Reis', email: 'ana@suinco.com.br', setorId: t.setorId } });
  const bia = await db.pessoa.create({ data: { nome: 'Bia Lima', email: 'bia@suinco.com.br', setorId: t.setorId } });
  const nb = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const nb2 = await db.equipamento.create({ data: { codigo: 'NB-2', tipo: 'Notebook Empréstimo' } });
  return { t, ag, ana, bia, nb, nb2 };
}
const reservar = (equipamentoId: string, pessoaId: string, ini: Date, fim: Date) =>
  db.reserva.create({ data: { equipamentoId, pessoaId, inicioEm: ini, fimEm: fim } });
const ocupacao = async (ag: Awaited<ReturnType<typeof entrarComo>>, ini: Date, fim: Date) =>
  (await ag.get(`/api/equipamentos/ocupacao?inicio=${ini.toISOString()}&fim=${fim.toISOString()}`).expect(200)).body as { codigo: string; motivo: string | null }[];

describe('ocupação de equipamento', () => {
  it('reserva que termina quando a outra começa não é conflito (borda)', async () => {
    const { ag, ana, nb } = await cenario();
    await reservar(nb.id, ana.id, amanha(8), amanha(12));
    const l = await ocupacao(ag, amanha(12), amanha(14));
    expect(l.find((x) => x.codigo === 'NB-1')!.motivo).toBeNull();
  });
  it('sobreposição mostra quem reservou e o horário', async () => {
    const { ag, ana, nb } = await cenario();
    await reservar(nb.id, ana.id, amanha(8), amanha(12));
    const l = await ocupacao(ag, amanha(11), amanha(13));
    expect(l.find((x) => x.codigo === 'NB-1')!.motivo).toBe('Indisponível: já reservado por Ana Reis das 08:00 às 12:00');
    expect(l.find((x) => x.codigo === 'NB-2')!.motivo).toBeNull();
  });
  it('reserva cancelada não ocupa', async () => {
    const { ag, ana, nb } = await cenario();
    const r = await reservar(nb.id, ana.id, amanha(8), amanha(12));
    await db.reserva.update({ where: { id: r.id }, data: { status: 'cancelada' } });
    expect((await ocupacao(ag, amanha(9), amanha(10))).find((x) => x.codigo === 'NB-1')!.motivo).toBeNull();
  });
  it('emprestado com devolução depois do início do período', async () => {
    const { ag, ana, nb } = await cenario();
    await db.emprestimo.create({ data: { equipamentoId: nb.id, pessoaId: ana.id, finalidade: 'Viagem', retiradaEm: new Date(), previsaoEm: amanha(10) } });
    const l = await ocupacao(ag, amanha(9), amanha(11));
    expect(l.find((x) => x.codigo === 'NB-1')!.motivo).toMatch(/^Indisponível: emprestado a Ana Reis até \d{2}\/\d{2}\/\d{4} 10:00$/);
  });
  it('em manutenção aparece com a situação', async () => {
    const { ag, nb } = await cenario();
    await db.equipamento.update({ where: { id: nb.id }, data: { situacao: 'manutencao' } });
    expect((await ocupacao(ag, amanha(9), amanha(10))).find((x) => x.codigo === 'NB-1')!.motivo).toBe('Em manutenção');
  });
  it('quem não reserva nem empresta não consulta', async () => {
    const c = await criarPessoaComAcesso(db, 'consulta');
    const ag = await entrarComo(app, c.email);
    await ag.get(`/api/equipamentos/ocupacao?inicio=${amanha(8).toISOString()}&fim=${amanha(9).toISOString()}`).expect(403);
  });
});

describe('lista de equipamentos', () => {
  it('mostra a próxima reserva ativa', async () => {
    const { ag, ana, nb } = await cenario();
    await reservar(nb.id, ana.id, amanha(8), amanha(12));
    const l = (await ag.get('/api/equipamentos?q=NB-1').expect(200)).body.itens as { codigo: string; proximaReserva: { pessoaNome: string } | null }[];
    expect(l.find((x) => x.codigo === 'NB-1')!.proximaReserva).toMatchObject({ pessoaNome: 'Ana Reis' });
  });
});

describe('empréstimo respeita reservas', () => {
  const corpo = (equipamentoId: string, pessoaId: string, previsaoEm: Date) => ({
    equipamentoId, pessoaId, finalidade: 'Viagem', retiradaEm: new Date().toISOString(), previsaoEm: previsaoEm.toISOString(), assinatura: PNG,
  });
  it('não empresta por cima da reserva de outra pessoa', async () => {
    const { ag, ana, bia, nb } = await cenario();
    await reservar(nb.id, ana.id, amanha(8), amanha(12));
    const r = await ag.post('/api/emprestimos').send(corpo(nb.id, bia.id, amanha(10))).expect(409);
    expect(r.body).toMatchObject({ codigo: 'conflito', mensagem: 'NB-1 está reservado para Ana Reis das 08:00 às 12:00. Escolha outro equipamento.' });
  });
  it('a própria pessoa da reserva pode levar', async () => {
    const { ag, ana, nb } = await cenario();
    await reservar(nb.id, ana.id, amanha(8), amanha(12));
    await ag.post('/api/emprestimos').send(corpo(nb.id, ana.id, amanha(10))).expect(201);
  });
  it('limite conta a reserva sobreposta da pessoa', async () => {
    const { ag, ana, nb, nb2 } = await cenario();
    await reservar(nb.id, ana.id, new Date(Date.now() + H), amanha(12));
    const r = await ag.post('/api/emprestimos').send(corpo(nb2.id, ana.id, amanha(10))).expect(409);
    expect(r.body).toMatchObject({ codigo: 'limite', mensagem: 'Ana Reis já está com 1 Notebook Empréstimo nesse período (limite: 1).' });
  });
});
