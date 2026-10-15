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
  proximaReserva: { pessoaNome: string; inicioEm: string } | null;
};

export type Setor = { id: string; nome: string; pessoas: number; equipamentos: number };

export const dataBR = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
export const dataHoraBR = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';
// colunas @db.Date chegam como meia-noite UTC: mostrar a data sem converter o fuso
export const diaBR = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');

export type Pessoa = {
  id: string; nome: string; email: string; setorId: string; setor: { id: string; nome: string };
  telefoneCorp: string | null; telefonePart: string | null; login: string; ativo: boolean; limites: Record<string, number>;
  acesso: { id: string; papel: string } | null; equipamentos: { id: string; codigo: string; tipo: string }[];
  temAssinatura: boolean; temFoto: boolean; tecnico: boolean; exclusaoTravada: string | null;
};

export type Emprestimo = {
  id: string; equipamento: { id: string; codigo: string; tipo: string; modelo: string };
  pessoa: { id: string; nome: string; email: string; telefoneCorp: string | null; telefonePart: string | null; setor: string };
  tecnico: { id: string; nome: string } | null; tecnicoId: string | null; finalidade: string; finalidadeOutra: string; chamadoGlpi: string;
  retiradaEm: string; previsaoEm: string | null; devolvidoEm: string | null; acessorios: string[]; acessoriosDevolvidos: string[];
  acessoriosFaltando: string[]; obs: string; obsDevolucao: string; temAssinaturaRetirada: boolean; temAssinaturaDevolucao: boolean;
  situacao: Situacao;
};

export type Config = {
  tiposEmprestaveis: string[]; acessorios: string[]; finalidades: { nome: string; dias: number; hora: string }[];
  bloqueioAtraso: boolean; assinaturas: boolean; glpiUrl: string; avisoMin: number;
  expediente: { ligado: boolean; dias: number[]; inicio: string; fim: string }; antecedenciaMin: number;
};

export type Reserva = {
  id: string; equipamento: { id: string; codigo: string; tipo: string; modelo: string };
  pessoa: { id: string; nome: string; email: string; setor: string; telefoneCorp: string | null; telefonePart: string | null };
  inicioEm: string; fimEm: string; finalidade: string; finalidadeOutra: string; chamadoGlpi: string; obs: string;
  status: 'ativa' | 'cancelada' | 'retirada'; pedidoId: string | null; emprestimoId: string | null; situacao: Situacao;
};

// Pedido como a TI vê (GET /pedidos e /pedidos/:id)
export type Pedido = {
  id: string; tipo: string; urgente: boolean; justificativa: string; finalidade: string; finalidadeOutra: string; chamadoGlpi: string;
  retiradaEm: string; devolucaoEm: string | null; acessorios: string[]; obs: string; telefoneCorp: string | null; telefonePart: string | null;
  status: 'pendente' | 'aprovado' | 'recusado' | 'cancelado' | 'entregue'; motivoRecusa: string; mensagemTi: string;
  respondidoEm: string | null; editadoEm: string | null; semEquipAvisadoEm: string | null; ultimaDe: 'colab' | 'ti' | 'sistema' | null; criadoEm: string;
  pessoa: { id: string; nome: string; email: string; setor: string; telefoneCorp: string | null; telefonePart: string | null };
  equipamento: { id: string; codigo: string; tipo: string; modelo: string } | null; reserva: { id: string; status: string } | null;
  emprestimo: { id: string } | null; temAssinatura: boolean; semEquipamento: boolean; atrasos: number;
};

export type Ramal = { id: string; numero: string; descricao: string; setor: string };
