import { z } from 'zod';
import { MOTIVOS_RECUSA } from '../constantes.js';
import { imagemBase64, dataHora, textoOpcional, telefoneOpcional, uuidObrigatorio } from './comum.js';

const comum = {
  tipo: z.string({ required_error: 'Escolha o tipo de equipamento.' }).trim().min(1, 'Escolha o tipo de equipamento.'),
  assinatura: imagemBase64.optional(),
  // a pessoa confirma os telefones do cadastro (true) ou informa outros (false / sem cadastro)
  telefonesConferem: z.boolean().optional(),
  telefoneCorp: telefoneOpcional,
  telefonePart: telefoneOpcional,
};
const datas = (msg: string) => z.union([z.string(), z.date()], { required_error: msg, invalid_type_error: msg }).pipe(dataHora);

const normal = z.object({
  urgente: z.literal(false),
  ...comum,
  finalidade: z.string({ required_error: 'Escolha a finalidade.' }).trim().min(1, 'Escolha a finalidade.'),
  finalidadeOutra: textoOpcional,
  chamadoGlpi: z.string({ required_error: 'Informe o nº do chamado GLPI.' }).trim()
    .min(1, 'Informe o nº do chamado GLPI.').regex(/^\d*$/, 'O chamado GLPI aceita só números.'),
  retiradaEm: datas('Informe as datas e horas de retirada e devolução.'),
  devolucaoEm: datas('Informe as datas e horas de retirada e devolução.'),
  acessorios: z.array(z.string()).default([]),
  obs: textoOpcional,
  confirmarRepetido: z.boolean().optional(),
});
const urgente = z.object({
  urgente: z.literal(true),
  ...comum,
  justificativa: z.string({ required_error: 'Explique por que o pedido é urgente.' }).trim()
    .min(1, 'Explique por que o pedido é urgente.').max(500),
});

// Pedido do colaborador: normal (com datas, finalidade e chamado) ou urgente (só a justificativa).
export const pedidoSchema = z.discriminatedUnion('urgente', [normal, urgente]).superRefine((p, ctx) => {
  if (p.urgente) return;
  if (p.finalidade === 'Outra' && !p.finalidadeOutra) ctx.addIssue({ code: 'custom', path: ['finalidadeOutra'], message: 'Descreva o motivo.' });
  if (p.devolucaoEm <= p.retiradaEm) ctx.addIssue({ code: 'custom', path: ['devolucaoEm'], message: 'A devolução precisa ser depois da retirada.' });
});
export type PedidoEntrada = z.infer<typeof pedidoSchema>;
export type PedidoNormal = z.infer<typeof normal>;

export const mensagemSchema = z.object({
  texto: z.string({ required_error: 'Escreva a mensagem.' }).trim().min(1, 'Escreva a mensagem.').max(2000, 'Mensagem longa demais (até 2.000 caracteres).'),
});
export const chamadoPedidoSchema = z.object({
  chamadoGlpi: z.string({ required_error: 'Informe o nº do chamado.' }).trim().min(1, 'Informe o nº do chamado.').regex(/^\d+$/, 'O chamado GLPI aceita só números.'),
});

export const aprovarSchema = z.object({
  equipamentoId: uuidObrigatorio('Escolha o equipamento.'),
  retiradaEm: datas('Defina retirada e devolução.'),
  devolucaoEm: datas('Defina retirada e devolução.'),
  mensagem: textoOpcional,
  atualizarTelefone: z.boolean().optional(),
  liberarLimite: z.boolean().optional(),
  liberarAtraso: z.boolean().optional(),
}).refine((a) => a.devolucaoEm > a.retiradaEm, { path: ['devolucaoEm'], message: 'A devolução precisa ser depois da retirada.' });
export type Aprovar = z.infer<typeof aprovarSchema>;

export const recusarSchema = z.object({
  motivo: z.enum(MOTIVOS_RECUSA, { errorMap: () => ({ message: 'Escolha o motivo da recusa.' }) }),
  detalhe: textoOpcional,
}).refine((r) => r.motivo !== 'Outro' || !!r.detalhe, { path: ['detalhe'], message: 'Descreva o motivo.' });
// texto que o colaborador vê
export const textoRecusa = (r: { motivo: string; detalhe: string }) => (r.motivo === 'Outro' ? r.detalhe : r.motivo + (r.detalhe ? `. ${r.detalhe}` : ''));

export const loteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Selecione pelo menos um pedido.').max(100, 'No máximo 100 pedidos por vez.'),
});
