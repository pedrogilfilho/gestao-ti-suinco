import { describe, it, expect } from 'vitest';
import { permissoesEfetivas, ehEquipeTI, PERMISSOES } from './permissoes.js';

describe('permissoesEfetivas', () => {
  it('dono tem todas', () => {
    expect(permissoesEfetivas({ papel: 'solicitante', dono: true, permissoes: {} }).size).toBe(PERMISSOES.length);
  });
  it('master tem todas', () => {
    expect([...permissoesEfetivas({ papel: 'master', dono: false, permissoes: {} })].sort()).toEqual([...PERMISSOES].sort());
  });
  it('tic sem grupo usa as do próprio acesso', () => {
    const p = permissoesEfetivas({ papel: 'tic', dono: false, permissoes: { emprestar: true, excluir: false } });
    expect([...p]).toEqual(['emprestar']);
  });
  it('grupo vence as do acesso', () => {
    const p = permissoesEfetivas({ papel: 'tic', dono: false, permissoes: { emprestar: true }, grupo: { permissoes: { auditoria: true } } });
    expect([...p]).toEqual(['auditoria']);
  });
  it('solicitante nunca tem permissão, mesmo marcada', () => {
    expect(permissoesEfetivas({ papel: 'solicitante', dono: false, permissoes: { excluir: true } }).size).toBe(0);
  });
  it('equipe da TI', () => {
    expect(ehEquipeTI('consulta', false)).toBe(true);
    expect(ehEquipeTI('solicitante', false)).toBe(false);
    expect(ehEquipeTI('solicitante', true)).toBe(true);
  });
});
