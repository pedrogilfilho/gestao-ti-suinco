export const TIPOS_EQUIP = ['Notebook Empréstimo', 'Notebook', 'Desktop', 'Monitor', 'Celular', 'Chip', 'Tablet', 'Coletor', 'Projetor', 'Mouse/Teclado', 'Headset', 'Rádio', 'Câmera', 'Switch', 'Telefone IP', 'Impressora', 'Outro'] as const;
export type TipoEquip = (typeof TIPOS_EQUIP)[number];
export const TIPOS_COM_IP: readonly TipoEquip[] = ['Notebook Empréstimo', 'Notebook', 'Desktop', 'Celular', 'Câmera', 'Switch', 'Telefone IP'];
export const TIPOS_IMPRESSORA: readonly TipoEquip[] = ['Impressora'];
// prédio e ponto de rede: equipamentos que ficam num lugar fixo (no app atual, "ehLocal"); esses não se vinculam a pessoa
export const TIPOS_LOCAL_FIXO: readonly TipoEquip[] = ['Câmera', 'Switch', 'Telefone IP'];
export const SITUACOES = ['ativo', 'manutencao', 'danificado', 'extraviado', 'baixado'] as const;
export type SituacaoEquip = (typeof SITUACOES)[number];
export const TERMO_STATUS = ['assinado', 'nao_assinado', 'nao_informado'] as const;
export const ACESSORIOS_PADRAO = ['Carregador', 'Mouse', 'Bolsa', 'Cabo de rede', 'Headset'];
export const FINALIDADES_PADRAO = [
  { nome: 'Integração', dias: 0, hora: '17:00' }, { nome: 'Treinamento', dias: 0, hora: '17:00' },
  { nome: 'Audiência', dias: 0, hora: '18:00' }, { nome: 'Home office', dias: 7, hora: '17:00' },
  { nome: 'Viagem', dias: 3, hora: '17:00' }, { nome: 'Outra', dias: 0, hora: '17:00' },
];
export const DOMINIO_EMAIL = '@suinco.com.br';

// módulo 2
export const MOTIVOS_RECUSA = [
  'Nenhum equipamento disponível no período', 'Prazo de antecedência insuficiente', 'Pedido sem autorização do gestor',
  'Chamado GLPI inválido ou não encontrado', 'Outro',
] as const;
export const STATUS_PEDIDO = ['pendente', 'aprovado', 'recusado', 'cancelado', 'entregue'] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const STATUS_RESERVA = ['ativa', 'cancelada', 'retirada'] as const;
export type StatusReserva = (typeof STATUS_RESERVA)[number];
