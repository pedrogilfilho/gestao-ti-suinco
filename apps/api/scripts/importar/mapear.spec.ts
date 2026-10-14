import { describe, it, expect } from 'vitest';
import { mapearPessoas, mapearAcessos, mapearEquipamentos, mapearEmprestimos, mapearConfig, SEM_SETOR, dataHoraSP } from './mapear';

const setores = new Map([['ti', 's-ti'], ['financeiro', 's-fin']]);

describe('mapearPessoas', () => {
  it('normaliza e-mail e avisa setor inexistente (Foco de revisão 5)', () => {
    const r = mapearPessoas([{ id: '  Ana@Suinco.com.br', nome: 'Ana', setor: 'TI' }, { id: 'b@suinco.com.br', nome: 'B', setor: 'Fantasma' }], setores);
    expect(r.dados[0]).toMatchObject({ email: 'ana@suinco.com.br', setorId: 's-ti' });
    expect(r.dados[1]!.setorId).toBe(SEM_SETOR);
    expect(r.avisos).toContain('Usuário b@suinco.com.br: setor "Fantasma" não existe; criado no setor "(sem setor)".');
  });
  it('setor casa sem acento e sem maiúsculas', () => {
    expect(mapearPessoas([{ id: 'c@suinco.com.br', nome: 'C', setor: 'FINANCEIRO ' }], setores).dados[0]!.setorId).toBe('s-fin');
  });
  it('e-mail repetido no backup: fica o primeiro, com aviso', () => {
    const r = mapearPessoas([{ id: 'd@suinco.com.br', nome: 'D', setor: 'TI' }, { id: 'D@suinco.com.br', nome: 'D2', setor: 'TI' }], setores);
    expect(r.dados).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/repetido/);
  });
  it('limites só valem com limiteExtra; desativado continua desativado', () => {
    const r = mapearPessoas([{ id: 'e@suinco.com.br', nome: 'E', setor: 'TI', limiteExtra: true, limites: { 'Notebook Empréstimo': 2 }, ativo: false }], setores);
    expect(r.dados[0]).toMatchObject({ limites: { 'Notebook Empréstimo': 2 }, ativo: false });
  });
});

describe('mapearAcessos', () => {
  const pessoas = new Map([['x@suinco.com.br', 'p-x'], ['a@suinco.com.br', 'pa'], ['g@suinco.com.br', 'pg']]);
  it('tecnico vira tic e ganha auditoria; equipamentos ganha almoxarifado', () => {
    const r = mapearAcessos([{ id: 'x@suinco.com.br', papel: 'tecnico', permissoes: { equipamentos: true } }], pessoas, new Map());
    expect(r.dados[0]).toMatchObject({ pessoaId: 'p-x', papel: 'tic', permissoes: { equipamentos: true, almoxarifado: true, auditoria: true } });
  });
  it('papel admin vira master; grupo usa o grupo e papel tic', () => {
    const r = mapearAcessos([{ id: 'a@suinco.com.br', papel: 'admin' }, { id: 'g@suinco.com.br', papel: 'grupo', grupo: 'g1' }], pessoas, new Map([['g1', 'uuid-g1']]));
    expect(r.dados.map((d) => [d.papel, d.grupoId])).toEqual([['master', null], ['tic', 'uuid-g1']]);
  });
  it('acesso sem pessoa no backup é ignorado com aviso', () => {
    const r = mapearAcessos([{ id: 'z@suinco.com.br', papel: 'consulta' }], pessoas, new Map());
    expect(r.dados).toHaveLength(0);
    expect(r.avisos[0]).toMatch(/z@suinco.com.br/);
  });
});

describe('mapearEquipamentos', () => {
  it('campos antigos vão para obs com aviso', () => {
    const r = mapearEquipamentos([{ id: 'C1', tipo: 'Celular', comCelular: 'sim', responsavel: 'Fulano' }], new Map(), new Map(), new Map());
    expect(r.dados[0]!.obs).toContain('responsavel: Fulano');
    expect(r.avisos[0]).toMatch(/C1/);
  });
  it('tipo antigo "Notebook de empréstimo" vira "Notebook Empréstimo"; tipo desconhecido vira Outro', () => {
    expect(mapearEquipamentos([{ id: 'N', tipo: 'Notebook de empréstimo' }], new Map(), new Map(), new Map()).dados[0]!.tipo).toBe('Notebook Empréstimo');
    const r = mapearEquipamentos([{ id: 'G', tipo: 'Geladeira' }], new Map(), new Map(), new Map());
    expect(r.dados[0]).toMatchObject({ tipo: 'Outro' });
    expect(r.dados[0]!.obs).toContain('tipo original: Geladeira');
  });
  it('vínculo pelo e-mail (em maiúsculas), pelo nome ou em texto livre', () => {
    const porEmail = new Map([['ana@suinco.com.br', 'pa']]), porNome = new Map([['bia souza', 'pb']]);
    const r = mapearEquipamentos([
      { id: 'E1', tipo: 'Celular', atribuidoA: 'Ana', atribuidoEmail: 'ANA@suinco.com.br', atribuidoEm: 1760000000000 },
      { id: 'E2', tipo: 'Celular', atribuidoA: 'Bia Souza' },
      { id: 'E3', tipo: 'Outro', atribuidoA: 'Sala de Reunião' },
    ], porEmail, porNome, new Map());
    expect(r.dados.map((d) => [d.pessoaId, d.vinculoLivre])).toEqual([['pa', ''], ['pb', ''], [null, 'Sala de Reunião']]);
    expect(r.dados[0]!.vinculadoEm).toEqual(new Date(1760000000000));
  });
  it('centro de custo pelo nome do setor; termo, número antigo e MAC', () => {
    const r = mapearEquipamentos([{ id: 'D', tipo: 'Desktop', centroCusto: 'Financeiro', termoAssinado: true, numero: '(34) 99999-0001', mac: 'aa:bb:cc:dd:ee:ff', ipTipo: 'fixo', ip: '10.0.0.9' }], new Map(), new Map(), setores);
    expect(r.dados[0]).toMatchObject({ setorId: 's-fin', termoStatus: 'assinado', numeroCorp: '(34) 99999-0001', mac: 'AA:BB:CC:DD:EE:FF', ipTipo: 'fixo', ip: '10.0.0.9' });
  });
  it('código repetido (sem diferenciar maiúsculas): fica o primeiro', () => {
    const r = mapearEquipamentos([{ id: 'X', tipo: 'Monitor' }, { id: 'x', tipo: 'Monitor' }], new Map(), new Map(), new Map());
    expect(r.dados).toHaveLength(1);
  });
});

describe('mapearEmprestimos', () => {
  const equips = new Map([['nb-1', 'e1'], ['nb-2', 'e2']]), pessoas = new Map([['ana@suinco.com.br', 'pa'], ['tec@suinco.com.br', 'pt']]);
  it('liga por chave e junta data e hora em Brasília', () => {
    const r = mapearEmprestimos([{
      id: 'EMP-1', equipamento: 'NB-1', email: 'Ana@suinco.com.br', tecnicoEmail: 'tec@suinco.com.br', finalidade: 'Viagem',
      dataEmprestimo: '2026-10-01', horaEmprestimo: '09:30', dataPrevisao: '2026-10-04', horaPrevisao: '17:00',
      acessorios: ['Carregador'], acessoriosFaltando: [], chamado: '43150',
    }], equips, pessoas);
    expect(r.dados[0]).toMatchObject({ equipamentoId: 'e1', pessoaId: 'pa', tecnicoId: 'pt', chamadoGlpi: '43150', devolvidoEm: null });
    expect(r.dados[0]!.retiradaEm.toISOString()).toBe('2026-10-01T12:30:00.000Z');
  });
  it('pessoa que não está no backup: ignorado com motivo', () => {
    const r = mapearEmprestimos([{ id: 'EMP-2', equipamento: 'NB-1', email: 'sumiu@suinco.com.br', dataEmprestimo: '2026-10-01' }], equips, pessoas);
    expect(r.dados).toHaveLength(0);
    expect(r.ignorados[0]).toEqual({ area: 'emprestimos', id: 'EMP-2', motivo: 'pessoa sumiu@suinco.com.br não está no backup' });
  });
  it('dois abertos no mesmo equipamento: fica o mais recente aberto, o outro é ignorado', () => {
    const r = mapearEmprestimos([
      { id: 'A', equipamento: 'NB-2', email: 'ana@suinco.com.br', dataEmprestimo: '2026-10-01' },
      { id: 'B', equipamento: 'NB-2', email: 'ana@suinco.com.br', dataEmprestimo: '2026-10-05' },
    ], equips, pessoas);
    expect(r.dados.map((d) => d.origem)).toEqual(['B']);
    expect(r.ignorados[0]!.motivo).toMatch(/outro empréstimo aberto/);
  });
  it('assinatura "SIM" (sem imagem) fica sem arquivo, com aviso', () => {
    const r = mapearEmprestimos([{ id: 'C', equipamento: 'NB-1', email: 'ana@suinco.com.br', dataEmprestimo: '2026-10-01', assinaturaEmprestimo: 'SIM' }], equips, pessoas);
    expect(r.dados[0]!.assinaturaRetirada).toBeNull();
    expect(r.avisos[0]).toMatch(/C/);
  });
});

describe('mapearConfig e datas', () => {
  it('só as chaves do núcleo; tipo antigo renomeado', () => {
    const c = mapearConfig({ tiposEmprestaveis: ['Notebook de empréstimo'], assinaturas: false, glpiUrl: 'https://glpi.test/?id=', expOn: true });
    expect(c).toMatchObject({ tiposEmprestaveis: ['Notebook Empréstimo'], assinaturas: false, glpiUrl: 'https://glpi.test/?id=' });
    expect(c).not.toHaveProperty('expOn');
  });
  it('dataHoraSP aceita AAAA-MM-DD e DD/MM/AAAA', () => {
    expect(dataHoraSP('2026-10-01', '08:00')!.toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(dataHoraSP('01/10/2026', '')!.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(dataHoraSP('', '')).toBeNull();
  });
});
