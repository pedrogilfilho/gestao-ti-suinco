import { describe, it, expect } from 'vitest';
import { previsaoSugerida, limiteDe } from './previsao.js';

describe('previsaoSugerida', () => {
  it('retirada + dias, na hora da finalidade (Brasília)', () => {
    const r = previsaoSugerida(new Date('2026-10-14T09:00:00-03:00'), { dias: 3, hora: '17:00' });
    expect(r.toISOString()).toBe('2026-10-17T20:00:00.000Z');
  });
  it('mesmo dia', () => {
    expect(previsaoSugerida(new Date('2026-10-14T09:00:00-03:00'), { dias: 0, hora: '18:00' }).toISOString()).toBe('2026-10-14T21:00:00.000Z');
  });
  it('retirada às 23h de Brasília conta o dia de Brasília, não o de UTC', () => {
    expect(previsaoSugerida(new Date('2026-10-15T02:00:00Z'), { dias: 1, hora: '17:00' }).toISOString()).toBe('2026-10-15T20:00:00.000Z');
  });
});

describe('limiteDe', () => {
  it('padrão 1; só vale o personalizado entre 1 e 50', () => {
    expect(limiteDe({}, 'Notebook Empréstimo')).toBe(1);
    expect(limiteDe({ 'Notebook Empréstimo': 3 }, 'Notebook Empréstimo')).toBe(3);
    expect(limiteDe({ 'Notebook Empréstimo': 0 }, 'Notebook Empréstimo')).toBe(1);
    expect(limiteDe(null, 'Notebook Empréstimo')).toBe(1);
  });
});
