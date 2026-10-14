import type { Situacao, SituacaoEquip } from '@gestao/shared';

// Formato que a API devolve (datas chegam como texto).
export type Equipamento = {
  id: string; codigo: string; tipo: string; modelo: string; patrimonio: string; serie: string; situacao: SituacaoEquip;
  somenteCadastro: boolean; pessoaId: string | null; pessoa: { id: string; nome: string; email: string } | null; vinculoLivre: string;
  vinculadoEm: string | null; setorId: string | null; setor: { id: string; nome: string } | null;
  ipTipo: 'dhcp' | 'fixo' | null; ip: string | null; mac: string | null; numeroCorp: string | null; numeroPart: string | null;
  tipoChip: string; termoStatus: 'assinado' | 'nao_assinado' | 'nao_informado'; termoObs: string; garantiaAte: string | null;
  predio: string; pontoRede: string; firmware: string; trocasCabeca: number | null; licencas: { nome: string; chave: string }[];
  dataAtivacao: string | null; obs: string; situacaoExibida: Situacao;
  emprestimoAberto: { id: string; pessoaId: string; pessoaNome: string; previsaoEm: string | null } | null;
};

export type Setor = { id: string; nome: string; pessoas: number; equipamentos: number };

export const dataBR = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
export const dataHoraBR = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';
// colunas @db.Date chegam como meia-noite UTC: mostrar a data sem converter o fuso
export const diaBR = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
