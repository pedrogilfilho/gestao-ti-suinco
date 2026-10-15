import { describe, it, expect } from 'vitest';
import { dentroExpediente, proximoUtil, textoExpediente, type Expediente } from './expediente.js';
import { situacaoReserva } from './situacoes.js';

const SEG_SEX: Expediente = { ligado: true, dias: [1, 2, 3, 4, 5], inicio: '07:30', fim: '17:30' };
const sp = (s: string) => new Date(`${s}-03:00`);

describe('expediente', () => {
  it('desligado aceita qualquer horário', () => {
    expect(dentroExpediente({ ...SEG_SEX, ligado: false }, sp('2026-10-18T03:00'))).toBe(true); // domingo
  });
  it('ligado: recusa sábado e depois do fim; bordas valem', () => {
    expect(dentroExpediente(SEG_SEX, sp('2026-10-17T10:00'))).toBe(false); // sábado
    expect(dentroExpediente(SEG_SEX, sp('2026-10-14T17:31'))).toBe(false);
    expect(dentroExpediente(SEG_SEX, sp('2026-10-14T07:30'))).toBe(true);
    expect(dentroExpediente(SEG_SEX, sp('2026-10-14T17:30'))).toBe(true);
    expect(dentroExpediente(SEG_SEX, sp('2026-10-14T07:29'))).toBe(false);
  });
  it('usa o horário de Brasília mesmo com a data em UTC', () => {
    expect(dentroExpediente(SEG_SEX, new Date('2026-10-14T10:30:00Z'))).toBe(true); // 07:30 em SP
    expect(dentroExpediente(SEG_SEX, new Date('2026-10-14T20:31:00Z'))).toBe(false); // 17:31 em SP
  });
  it('próximo horário útil', () => {
    expect(proximoUtil(SEG_SEX, sp('2026-10-16T18:00'))).toEqual(sp('2026-10-19T07:30')); // sexta à noite → segunda
    expect(proximoUtil(SEG_SEX, sp('2026-10-14T06:00'))).toEqual(sp('2026-10-14T07:30'));
    expect(proximoUtil(SEG_SEX, sp('2026-10-14T10:15'))).toEqual(sp('2026-10-14T10:15'));
    expect(proximoUtil({ ...SEG_SEX, dias: [] }, sp('2026-10-14T10:15'))).toBeNull();
  });
  it('texto do expediente', () => {
    expect(textoExpediente(SEG_SEX)).toBe('segunda a sexta, das 07:30 às 17:30');
    expect(textoExpediente({ ...SEG_SEX, dias: [5, 1, 3] })).toBe('segunda, quarta, sexta, das 07:30 às 17:30');
  });
});

describe('situacaoReserva', () => {
  const r = { status: 'ativa' as const, inicioEm: sp('2026-10-14T09:00'), fimEm: sp('2026-10-14T17:00') };
  it('retirada e cancelada', () => {
    expect(situacaoReserva({ ...r, status: 'retirada' }, sp('2026-10-14T10:00'))).toEqual({ k: 'retirada', txt: 'Retirada (empréstimo)', cls: 'ok' });
    expect(situacaoReserva({ ...r, status: 'cancelada' }, sp('2026-10-14T10:00')).txt).toBe('Cancelada');
  });
  it('reservada, hoje e não retirada pelo dia de Brasília', () => {
    expect(situacaoReserva(r, sp('2026-10-13T10:00')).txt).toBe('Reservada');
    expect(situacaoReserva(r, sp('2026-10-14T23:59')).txt).toBe('Hoje');
    expect(situacaoReserva(r, sp('2026-10-15T00:00')).txt).toBe('Não retirada');
  });
});
