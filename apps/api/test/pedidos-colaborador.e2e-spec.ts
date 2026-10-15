import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient, Prisma } from '@prisma/client';
import { montarApp, limparBanco, criarPessoaComAcesso, entrarComo, PNG } from './app';

let app: INestApplication, db: PrismaClient;
beforeAll(async () => ({ app, db } = await montarApp()));
beforeEach(async () => limparBanco(db));
afterAll(async () => { await app.close(); await db.$disconnect(); });

const H = 3_600_000, DIA = 24 * H;
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const em = (dias: number, hm: string) => new Date(`${diaSP(new Date(Date.now() + dias * DIA))}T${hm}:00-03:00`);
// próximo dia da semana (0 = domingo) depois de hoje, às hm de Brasília
const proximo = (dow: number, hm: string) => {
  for (let i = 1; i <= 7; i++) { const d = em(i, hm); if (new Date(`${diaSP(d)}T12:00:00Z`).getUTCDay() === dow) return d; }
  throw new Error('sem dia');
};
// mesmo horário de Brasília, `dias` depois
const depois = (d: Date, dias: number, hm: string) => new Date(`${diaSP(new Date(d.getTime() + dias * DIA))}T${hm}:00-03:00`);
const config = (valor: Prisma.InputJsonValue) => db.config.upsert({ where: { chave: 'nucleo' }, create: { chave: 'nucleo', valor }, update: { valor } });

async function cenario() {
  const s = await criarPessoaComAcesso(db, 'solicitante');
  await db.pessoa.update({ where: { id: s.pessoaId }, data: { nome: 'Caio Prado', telefoneCorp: '(34) 99999-0000' } });
  const ag = await entrarComo(app, s.email);
  const nb = await db.equipamento.create({ data: { codigo: 'NB-1', tipo: 'Notebook Empréstimo' } });
  const normal = (x: Record<string, unknown> = {}) => ({
    urgente: false, tipo: 'Notebook Empréstimo', finalidade: 'Viagem', chamadoGlpi: '4512',
    retiradaEm: proximo(2, '09:00').toISOString(), devolucaoEm: depois(proximo(2, '09:00'), 2, '17:00').toISOString(),
    acessorios: ['Carregador'], assinatura: PNG, telefonesConferem: true, ...x,
  });
  return { s, ag, nb, normal };
}

describe('pedido do colaborador', () => {
  it('normal: grava com os telefones do cadastro e aparece em Meus pedidos', async () => {
    const { s, ag, normal } = await cenario();
    const r = await ag.post('/api/pedidos').send(normal()).expect(201);
    const p = await db.pedido.findUnique({ where: { id: r.body.id } });
    expect(p).toMatchObject({ pessoaId: s.pessoaId, status: 'pendente', telefoneCorp: '(34) 99999-0000', chamadoGlpi: '4512' });
    expect(p!.assinaturaUrl).toMatch(/^assinaturas\//);
    expect(await db.auditoria.count({ where: { area: 'pedidos', acao: 'criar' } })).toBe(1);
    const meus = (await ag.get('/api/pedidos/meus').expect(200)).body;
    expect(meus.itens).toHaveLength(1);
    expect(meus.telefones).toEqual({ corp: '(34) 99999-0000', part: null });
  });
  it('a TI não faz pedido', async () => {
    const t = await criarPessoaComAcesso(db, 'tic', { permissoes: ['reservar', 'emprestar'] });
    const { normal } = await cenario();
    const r = await (await entrarComo(app, t.email)).post('/api/pedidos').send(normal()).expect(403);
    expect(r.body.mensagem).toBe('A TI não faz pedidos: registre o empréstimo ou a reserva direto.');
  });
  it('antecedência mínima', async () => {
    const { ag, normal } = await cenario();
    const r = await ag.post('/api/pedidos').send(normal({ retiradaEm: new Date(Date.now() + 10 * 60_000).toISOString() })).expect(400);
    expect(r.body.mensagem).toMatch(/^A retirada precisa ser com pelo menos 15 min de antecedência \(a partir de \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\), para a TI preparar o equipamento\.$/);
  });
  it('expediente ligado: sábado é recusado com o próximo horário útil', async () => {
    const { ag, normal } = await cenario();
    await config({ expediente: { ligado: true, dias: [1, 2, 3, 4, 5], inicio: '07:30', fim: '17:30' } });
    const sab = proximo(6, '10:00');
    const r = await ag.post('/api/pedidos').send(normal({ retiradaEm: sab.toISOString(), devolucaoEm: depois(sab, 2, '17:00').toISOString() })).expect(400);
    expect(r.body.mensagem).toMatch(/^A TI está fechada nesse horário de retirada\. Atendimento: segunda a sexta, das 07:30 às 17:30\. Próximo horário útil: \d{2}\/\d{2}\/\d{4} 07:30\.$/);
    expect(r.body.campo).toBe('retiradaEm');
  });
  it('atraso bloqueia o pedido', async () => {
    const { s, ag, nb, normal } = await cenario();
    await db.emprestimo.create({ data: { equipamentoId: nb.id, pessoaId: s.pessoaId, finalidade: 'Viagem', retiradaEm: new Date(Date.now() - 3 * DIA), previsaoEm: new Date(Date.now() - DIA) } });
    const r = await ag.post('/api/pedidos').send(normal()).expect(409);
    expect(r.body).toMatchObject({ codigo: 'atraso', mensagem: 'Você está com equipamento em atraso (NB-1). Devolva-o à TI antes de fazer um novo pedido.' });
  });
  it('limite conta a reserva (pedido aprovado) no período', async () => {
    const { s, ag, nb, normal } = await cenario();
    await db.reserva.create({ data: { equipamentoId: nb.id, pessoaId: s.pessoaId, inicioEm: proximo(2, '08:00'), fimEm: proximo(2, '18:00') } });
    const r = await ag.post('/api/pedidos').send(normal()).expect(409);
    expect(r.body).toMatchObject({
      codigo: 'limite',
      mensagem: 'Nesse período você já tem 1 Notebook Empréstimo (entre empréstimos e pedidos aprovados) e o seu limite é 1. Escolha outro período, devolva um item ou cancele um pedido. Se precisar de mais, fale com a TI.',
    });
  });
  it('chamado obrigatório; urgente sem justificativa', async () => {
    const { ag, normal } = await cenario();
    expect((await ag.post('/api/pedidos').send(normal({ chamadoGlpi: '' })).expect(400)).body.mensagem).toBe('Informe o nº do chamado GLPI.');
    expect((await ag.post('/api/pedidos').send({ urgente: true, tipo: 'Notebook Empréstimo', assinatura: PNG, telefonesConferem: true }).expect(400)).body.mensagem)
      .toBe('Explique por que o pedido é urgente.');
  });
  it('urgente: retirada agora, sem devolução, mesmo fora do expediente', async () => {
    const { ag } = await cenario();
    await config({ expediente: { ligado: true, dias: [], inicio: '07:30', fim: '17:30' } });
    const r = await ag.post('/api/pedidos').send({ urgente: true, tipo: 'Notebook Empréstimo', justificativa: 'Auditoria agora', assinatura: PNG, telefonesConferem: true }).expect(201);
    const p = await db.pedido.findUnique({ where: { id: r.body.id } });
    expect(p!.urgente).toBe(true);
    expect(p!.devolucaoEm).toBeNull();
    expect(Math.abs(p!.retiradaEm.getTime() - Date.now())).toBeLessThan(60_000);
  });
  it('pedido repetido pergunta antes', async () => {
    const { ag, normal } = await cenario();
    await ag.post('/api/pedidos').send(normal()).expect(201);
    const r = await ag.post('/api/pedidos').send(normal()).expect(409);
    expect(r.body.codigo).toBe('repetido');
    expect(r.body.mensagem).toMatch(/^Você já tem um pedido pendente para esse período \(.+ até .+\)\.\n\nEnviar mesmo assim\?$/);
    await ag.post('/api/pedidos').send(normal({ confirmarRepetido: true })).expect(201);
  });
  it('telefones: com cadastro precisa confirmar; corrigido exige um válido', async () => {
    const { ag, normal } = await cenario();
    const { telefonesConferem, ...sem } = normal();
    expect((await ag.post('/api/pedidos').send(sem).expect(400)).body.mensagem).toBe('Confirme se os seus telefones estão corretos.');
    expect((await ag.post('/api/pedidos').send(normal({ telefonesConferem: false })).expect(400)).body.mensagem)
      .toBe('Informe pelo menos um telefone com DDD, por exemplo (34) 99999-9999.');
    const r = await ag.post('/api/pedidos').send(normal({ telefonesConferem: false, telefonePart: '34988887777' })).expect(201);
    expect(await db.pedido.findUnique({ where: { id: r.body.id } })).toMatchObject({ telefoneCorp: null, telefonePart: '(34) 98888-7777' });
    void telefonesConferem;
  });
  it('editar e cancelar só enquanto pendente; só o dono', async () => {
    const { ag, normal } = await cenario();
    const r = await ag.post('/api/pedidos').send(normal()).expect(201);
    await ag.patch(`/api/pedidos/${r.body.id}`).send(normal({ chamadoGlpi: '9999' })).expect(200);
    const p = await db.pedido.findUnique({ where: { id: r.body.id }, include: { mensagens: true } });
    expect(p!.editadoEm).not.toBeNull();
    expect(p!.mensagens.map((m) => [m.de, m.texto])).toEqual([['sistema', 'O colaborador editou o pedido.']]);
    const outro = await criarPessoaComAcesso(db, 'solicitante');
    await (await entrarComo(app, outro.email)).patch(`/api/pedidos/${r.body.id}`).send(normal()).expect(403);
    await db.pedido.update({ where: { id: r.body.id }, data: { status: 'aprovado' } });
    expect((await ag.patch(`/api/pedidos/${r.body.id}`).send(normal()).expect(409)).body.mensagem)
      .toBe('Esse pedido já foi respondido pela TI e não pode mais ser editado.');
    await ag.post(`/api/pedidos/${r.body.id}/cancelar`).expect(409);
  });
  it('cancelar pendente', async () => {
    const { ag, normal } = await cenario();
    const r = await ag.post('/api/pedidos').send(normal()).expect(201);
    await ag.post(`/api/pedidos/${r.body.id}/cancelar`).expect(200);
    expect((await db.pedido.findUnique({ where: { id: r.body.id } }))!.status).toBe('cancelado');
  });
});
