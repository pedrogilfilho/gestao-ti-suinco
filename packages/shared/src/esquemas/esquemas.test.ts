import { describe, it, expect } from 'vitest';
import { emailSchema, telefoneSchema, equipamentoSchema, pessoaSchema, emprestimoNovoSchema, configNucleoSchema, setorSchema } from './index.js';

describe('emailSchema', () => {
  it('normaliza maiúsculas e espaços (Foco de revisão 5)', () => {
    expect(emailSchema.parse('  Joao.Silva@SUINCO.com.br ')).toBe('joao.silva@suinco.com.br');
  });
  it('completa o domínio quando falta o @ (paridade sE/sY)', () => {
    expect(emailSchema.parse('Fulana.Tal')).toBe('fulana.tal@suinco.com.br');
  });
  it('recusa outro domínio com a mensagem do app atual', () => {
    const r = emailSchema.safeParse('joao@gmail.com');
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('O e-mail precisa terminar em @suinco.com.br.');
  });
});

describe('telefoneSchema', () => {
  it('formata com DDD', () => {
    expect(telefoneSchema.parse('34999998888')).toBe('(34) 99999-8888');
    expect(telefoneSchema.parse('(34) 3333-4444')).toBe('(34) 3333-4444');
  });
  it('recusa sem DDD', () => {
    expect(telefoneSchema.safeParse('99998888').success).toBe(false);
  });
});

describe('setorSchema', () => {
  it('junta espaços', () => {
    expect(setorSchema.parse({ nome: '  Recursos   Humanos ' }).nome).toBe('Recursos Humanos');
  });
});

describe('equipamentoSchema', () => {
  const base = { codigo: 'NB-01', tipo: 'Notebook Empréstimo' };
  it('IP fixo exige IP válido', () => {
    expect(equipamentoSchema.safeParse({ ...base, ipTipo: 'fixo' }).success).toBe(false);
    expect(equipamentoSchema.safeParse({ ...base, ipTipo: 'fixo', ip: '10.0.0.300' }).success).toBe(false);
    expect(equipamentoSchema.safeParse({ ...base, ipTipo: 'fixo', ip: '10.0.0.30' }).success).toBe(true);
  });
  it('IP só para tipos com IP', () => {
    expect(equipamentoSchema.safeParse({ codigo: 'M1', tipo: 'Monitor', ipTipo: 'dhcp' }).success).toBe(false);
  });
  it('MAC no formato AA:BB:CC:DD:EE:FF, aceitando minúsculas', () => {
    expect(equipamentoSchema.parse({ ...base, mac: 'aa:bb:cc:dd:ee:ff' }).mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(equipamentoSchema.safeParse({ ...base, mac: 'AA:BB:CC' }).success).toBe(false);
  });
  it('tipo fora da lista é recusado', () => {
    const r = equipamentoSchema.safeParse({ codigo: 'X', tipo: 'Geladeira' });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('Tipo de equipamento inválido.');
  });
  it('vínculo com pessoa e texto livre ao mesmo tempo é recusado', () => {
    const r = equipamentoSchema.safeParse({ ...base, pessoaId: '11111111-1111-4111-8111-111111111111', vinculoLivre: 'Sala' });
    expect(r.success).toBe(false);
  });
  it('equipamento de local fixo não guarda vínculo', () => {
    const r = equipamentoSchema.parse({ codigo: 'CAM-1', tipo: 'Câmera', vinculoLivre: 'Portaria' });
    expect(r.vinculoLivre).toBe('');
    expect(r.pessoaId).toBeNull();
  });
});

describe('pessoaSchema', () => {
  it('setor obrigatório', () => {
    const r = pessoaSchema.safeParse({ nome: 'Ana', email: 'ana@suinco.com.br' });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('Selecione o setor.');
  });
  it('foto aceita JPEG', () => {
    const r = pessoaSchema.safeParse({ nome: 'Ana', email: 'ana', setorId: '11111111-1111-4111-8111-111111111111', foto: 'data:image/jpeg;base64,/9j/4AAQ' });
    expect(r.success).toBe(true);
  });
});

describe('emprestimoNovoSchema', () => {
  const b = { equipamentoId: 'e', pessoaId: 'p', finalidade: 'Viagem', retiradaEm: '2026-10-14T10:00:00-03:00', previsaoEm: '2026-10-17T17:00:00-03:00' };
  it('finalidade Outra exige descrição', () => {
    expect(emprestimoNovoSchema.safeParse({ ...b, finalidade: 'Outra' }).success).toBe(false);
    expect(emprestimoNovoSchema.safeParse({ ...b, finalidade: 'Outra', finalidadeOutra: 'Evento' }).success).toBe(true);
  });
  it('chamado GLPI só números', () => {
    expect(emprestimoNovoSchema.safeParse({ ...b, chamadoGlpi: '43A' }).success).toBe(false);
  });
  it('previsão obrigatória e depois da retirada (paridade sA)', () => {
    const { previsaoEm, ...sem } = b;
    expect(emprestimoNovoSchema.safeParse(sem).error!.issues[0]!.message).toBe('Informe a previsão de entrega.');
    const antes = emprestimoNovoSchema.safeParse({ ...b, previsaoEm: '2026-10-14T09:00:00-03:00' });
    expect(antes.error!.issues[0]!.message).toBe('A previsão de entrega precisa ser depois da retirada.');
  });
});

describe('configNucleoSchema', () => {
  it('padrões do app atual', () => {
    const c = configNucleoSchema.parse({});
    expect(c.tiposEmprestaveis).toEqual(['Notebook Empréstimo']);
    expect(c.avisoMin).toBe(120);
  });
  it('aviso abaixo de 5 minutos vira 5 (paridade sF)', () => {
    expect(configNucleoSchema.parse({ avisoMin: -10 }).avisoMin).toBe(5);
  });
  it('lista de tipos emprestáveis vazia é recusada', () => {
    expect(configNucleoSchema.safeParse({ tiposEmprestaveis: [] }).success).toBe(false);
  });
});
