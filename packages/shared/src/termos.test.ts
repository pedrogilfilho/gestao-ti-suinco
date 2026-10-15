import { describe, it, expect } from 'vitest';
import { preencherTermo, textoTermo, descAtivo, diasAtrasoTermo, estadoTermo, TXT_TERMO_RESP_PAD } from './termos.js';
import { configNucleoSchema } from './esquemas/config.js';

describe('termos', () => {
  it('troca os campos em qualquer caixa e campo vazio vira texto vazio', () => {
    expect(preencherTermo('Eu, {NOME}, do {setor} ({Email}) em {data}.', { nome: 'Ana', setor: '', data: '15/10/2026' }))
      .toBe('Eu, Ana, do  () em 15/10/2026.');
  });
  it('texto vazio na configuração usa o padrão', () => {
    const cfg = configNucleoSchema.parse({});
    expect(textoTermo(cfg, 'resp', { nome: 'Ana' })).toBe(TXT_TERMO_RESP_PAD);
    expect(textoTermo({ ...cfg, termoTxtEmp: 'Oi {nome}' }, 'emp', { nome: 'Ana' })).toBe('Oi Ana');
  });
  it('descrição do item por tipo', () => {
    expect(descAtivo({ tipo: 'Chip', tipoChip: 'eSIM', numeroCorp: '(34) 9999-0001', numeroPart: null })).toBe('eSIM · Corporativo (34) 9999-0001');
    expect(descAtivo({ tipo: 'Celular', modelo: 'A15', dataAtivacao: new Date('2026-03-02T12:00:00Z') })).toBe('A15 · ativação 02/03/2026');
    expect(descAtivo({ tipo: 'Notebook', modelo: 'Dell', patrimonio: '123', serie: '' })).toBe('Dell · patr. 123');
  });
  it('atraso pelo dia de São Paulo; prazo 0 e item assinado não atrasam', () => {
    const agora = new Date('2026-10-15T02:00:00Z'); // 14/10 23:00 em SP
    const vinc = new Date('2026-10-04T15:00:00Z');
    expect(diasAtrasoTermo({ termoStatus: 'nao_assinado', vinculadoEm: vinc }, 7, agora)).toBe(3);
    expect(diasAtrasoTermo({ termoStatus: 'nao_informado', vinculadoEm: vinc }, 7, agora)).toBe(3);
    expect(diasAtrasoTermo({ termoStatus: 'assinado', vinculadoEm: vinc }, 7, agora)).toBe(0);
    expect(diasAtrasoTermo({ termoStatus: 'nao_assinado', vinculadoEm: vinc }, 0, agora)).toBe(0);
    expect(diasAtrasoTermo({ termoStatus: 'nao_assinado', vinculadoEm: null }, 7, agora)).toBe(0);
    expect(diasAtrasoTermo({ termoStatus: 'nao_assinado', vinculadoEm: vinc }, 10, agora)).toBe(0);
  });
  it('estado da pessoa', () => {
    expect(estadoTermo([{ termoStatus: 'assinado' }, { termoStatus: 'nao_assinado' }])).toBe('pend');
    expect(estadoTermo([{ termoStatus: 'assinado' }, { termoStatus: 'nao_informado' }])).toBe('sem');
    expect(estadoTermo([{ termoStatus: 'assinado' }])).toBe('ok');
  });
  it('config: prazo de 0 a 90 e termo automático ligado por padrão', () => {
    const c = configNucleoSchema.parse({});
    expect([c.termoAuto, c.prazoTermoDias, c.termoTxtEmp]).toEqual([true, 7, '']);
    expect(configNucleoSchema.safeParse({ prazoTermoDias: 91 }).error?.issues[0]?.message).toBe('O prazo vai de 0 a 90 dias.');
  });
});
