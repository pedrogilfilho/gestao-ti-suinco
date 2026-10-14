import { describe, it, expect } from 'vitest';
import { situacaoEquipamento, situacaoEmprestimo, type EquipParaSituacao } from './situacoes.js';

const eq = (x: Partial<EquipParaSituacao> = {}): EquipParaSituacao =>
  ({ situacao: 'ativo', somenteCadastro: false, pessoaId: null, vinculoLivre: null, ...x });

describe('situacaoEquipamento', () => {
  it('situação gravada vem primeiro', () => {
    expect(situacaoEquipamento(eq({ situacao: 'baixado', pessoaId: 'p' }), true).txt).toBe('Baixado');
    expect(situacaoEquipamento(eq({ situacao: 'manutencao' }), false)).toEqual({ k: 'manut', txt: 'Em manutenção', cls: 'warn' });
  });
  it('vinculado antes de emprestado', () => {
    expect(situacaoEquipamento(eq({ pessoaId: 'p' }), true).txt).toBe('Vinculado');
  });
  it('vínculo em texto livre também conta como Vinculado', () => {
    expect(situacaoEquipamento(eq({ vinculoLivre: 'Sala de Reunião' }), false).txt).toBe('Vinculado');
  });
  it('somente cadastro sem vínculo = Em estoque', () => {
    expect(situacaoEquipamento(eq({ somenteCadastro: true }), false).txt).toBe('Em estoque');
  });
  it('emprestado e disponível', () => {
    expect(situacaoEquipamento(eq(), true).txt).toBe('Emprestado');
    expect(situacaoEquipamento(eq(), false).txt).toBe('Disponível');
  });
});

describe('situacaoEmprestimo', () => {
  const agora = new Date('2026-10-14T15:00:00-03:00');
  const base = { devolvidoEm: null, acessoriosFaltando: [] as string[], assinaturaDevolucaoUrl: null, previsaoEm: null as Date | null };
  it('devolvido com pendência e sem assinatura', () => {
    expect(situacaoEmprestimo({ ...base, devolvidoEm: agora, acessoriosFaltando: ['Mouse'] }, agora, true).txt).toBe('Devolvido com pendência');
    expect(situacaoEmprestimo({ ...base, devolvidoEm: agora }, agora, true).txt).toBe('Devolvido sem assinatura');
    expect(situacaoEmprestimo({ ...base, devolvidoEm: agora }, agora, false).txt).toBe('Devolvido');
  });
  it('sem previsão', () => {
    expect(situacaoEmprestimo(base, agora, true).txt).toBe('Sem previsão de entrega');
  });
  it('vence hoje às 23:30 (Brasília), com o relógio em UTC', () => {
    const s = situacaoEmprestimo({ ...base, previsaoEm: new Date('2026-10-15T02:30:00Z') }, agora, true);
    expect(s).toEqual({ k: 'aberto', txt: 'Vence hoje às 23:30', cls: 'warn' });
  });
  it('atrasado hoje e atrasado N dias', () => {
    expect(situacaoEmprestimo({ ...base, previsaoEm: new Date('2026-10-14T10:00:00-03:00') }, agora, true).txt).toBe('Atrasado hoje');
    expect(situacaoEmprestimo({ ...base, previsaoEm: new Date('2026-10-13T17:00:00-03:00') }, agora, true).txt).toBe('Atrasado 1 dia');
    expect(situacaoEmprestimo({ ...base, previsaoEm: new Date('2026-10-10T17:00:00-03:00') }, agora, true).txt).toBe('Atrasado 4 dias');
  });
  it('emprestado no prazo', () => {
    expect(situacaoEmprestimo({ ...base, previsaoEm: new Date('2026-10-20T17:00:00-03:00') }, agora, true)).toEqual({ k: 'aberto', txt: 'Emprestado', cls: 'out' });
  });
});
