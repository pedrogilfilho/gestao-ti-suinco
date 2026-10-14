import { describe, it, expect } from 'vitest';
import { diaSP, horaSP, diasEntre } from './datas.js';

describe('datas em America/Sao_Paulo', () => {
  it('23:30 de Brasília ainda é o mesmo dia, mesmo sendo 02:30 UTC do dia seguinte', () => {
    const d = new Date('2026-10-15T02:30:00Z');
    expect(diaSP(d)).toBe('2026-10-14');
    expect(horaSP(d)).toBe('23:30');
  });
  it('diasEntre conta dias de calendário', () => {
    expect(diasEntre('2026-10-10', '2026-10-14')).toBe(4);
    expect(diasEntre('2026-10-14', '2026-10-14')).toBe(0);
  });
});
