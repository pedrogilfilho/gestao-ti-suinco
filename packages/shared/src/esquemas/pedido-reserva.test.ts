import { describe, it, expect } from 'vitest';
import { pedidoSchema, recusarSchema, reservaSchema, configNucleoSchema, MOTIVOS_RECUSA } from '../index.js';

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;
const normal = {
  urgente: false, tipo: 'Notebook Empréstimo', finalidade: 'Viagem', chamadoGlpi: '123',
  retiradaEm: '2026-10-20T09:00:00-03:00', devolucaoEm: '2026-10-22T17:00:00-03:00',
};

describe('pedidoSchema', () => {
  it('normal válido', () => {
    expect(pedidoSchema.safeParse(normal).success).toBe(true);
  });
  it('chamado obrigatório e só números', () => {
    expect(msg(pedidoSchema.safeParse({ ...normal, chamadoGlpi: '' }))).toBe('Informe o nº do chamado GLPI.');
    expect(msg(pedidoSchema.safeParse({ ...normal, chamadoGlpi: '12a' }))).toBe('O chamado GLPI aceita só números.');
  });
  it('devolução depois da retirada', () => {
    expect(msg(pedidoSchema.safeParse({ ...normal, devolucaoEm: normal.retiradaEm }))).toBe('A devolução precisa ser depois da retirada.');
  });
  it('Outra pede o motivo', () => {
    expect(msg(pedidoSchema.safeParse({ ...normal, finalidade: 'Outra' }))).toBe('Descreva o motivo.');
  });
  it('urgente pede a justificativa e dispensa datas', () => {
    expect(msg(pedidoSchema.safeParse({ urgente: true, tipo: 'Notebook Empréstimo' }))).toBe('Explique por que o pedido é urgente.');
    expect(pedidoSchema.safeParse({ urgente: true, tipo: 'Notebook Empréstimo', justificativa: 'Reunião agora' }).success).toBe(true);
  });
});

describe('recusarSchema', () => {
  it('motivo da lista; Outro exige detalhe', () => {
    expect(MOTIVOS_RECUSA.at(-1)).toBe('Outro');
    expect(recusarSchema.safeParse({ motivo: MOTIVOS_RECUSA[0] }).success).toBe(true);
    expect(msg(recusarSchema.safeParse({ motivo: 'Outro' }))).toBe('Descreva o motivo.');
    expect(recusarSchema.safeParse({ motivo: 'Qualquer' }).success).toBe(false);
  });
});

describe('reservaSchema', () => {
  const base = {
    pessoaId: '11111111-1111-4111-8111-111111111111', equipamentoId: '22222222-2222-4222-8222-222222222222',
    inicioEm: '2026-10-20T08:00:00-03:00', fimEm: '2026-10-20T12:00:00-03:00', finalidade: 'Treinamento',
  };
  it('válida e fim depois do início', () => {
    expect(reservaSchema.safeParse(base).success).toBe(true);
    expect(msg(reservaSchema.safeParse({ ...base, fimEm: base.inicioEm }))).toBe('O horário final precisa ser depois do inicial.');
  });
});

describe('config do módulo 2', () => {
  it('padrões do expediente e da antecedência', () => {
    const c = configNucleoSchema.parse({});
    expect(c.expediente).toEqual({ ligado: false, dias: [1, 2, 3, 4, 5], inicio: '07:30', fim: '17:30' });
    expect(c.antecedenciaMin).toBe(15);
  });
  it('fim do expediente depois do início', () => {
    const r = configNucleoSchema.safeParse({ expediente: { ligado: true, dias: [1], inicio: '18:00', fim: '08:00' } });
    expect(msg(r)).toBe('O fim do expediente precisa ser depois do início.');
  });
});
