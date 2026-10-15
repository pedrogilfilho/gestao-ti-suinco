import { z } from 'zod';
import { imagemBase64, dataHora, textoOpcional } from './comum.js';

const previsaoObrigatoria = z.union([z.string(), z.date()], { required_error: 'Informe a previsão de entrega.', invalid_type_error: 'Informe a previsão de entrega.' }).pipe(dataHora);

const camposEmprestimo = z.object({
  equipamentoId: z.string({ required_error: 'Escolha o equipamento.' }).min(1, 'Escolha o equipamento.'),
  pessoaId: z.string({ required_error: 'Escolha o colaborador.' }).min(1, 'Escolha o colaborador.'),
  tecnicoId: z.string().optional(),
  finalidade: z.string({ required_error: 'Escolha a finalidade.' }).trim().min(1, 'Escolha a finalidade.'),
  finalidadeOutra: textoOpcional,
  chamadoGlpi: z.string().regex(/^\d*$/, 'O chamado GLPI aceita só números.').optional().default(''),
  retiradaEm: dataHora,
  previsaoEm: previsaoObrigatoria,
  acessorios: z.array(z.string()).default([]),
  assinatura: imagemBase64.optional(),
  obs: textoOpcional,
  liberarLimite: z.boolean().optional(),
  confirmarAtraso: z.boolean().optional(),
  // módulo 2: empréstimo que nasce de uma reserva ou de um pedido
  reservaId: z.string().uuid().optional(),
  pedidoId: z.string().uuid().optional(),
});

const regras = (e: { finalidade?: string; finalidadeOutra?: string; retiradaEm?: Date; previsaoEm?: Date }, ctx: z.RefinementCtx) => {
  if (e.finalidade === 'Outra' && !e.finalidadeOutra) ctx.addIssue({ code: 'custom', path: ['finalidadeOutra'], message: 'Descreva o motivo.' });
  if (e.retiradaEm && e.previsaoEm && e.previsaoEm <= e.retiradaEm)
    ctx.addIssue({ code: 'custom', path: ['previsaoEm'], message: 'A previsão de entrega precisa ser depois da retirada.' });
};

export const emprestimoNovoSchema = camposEmprestimo.superRefine(regras);
export const emprestimoEdicaoSchema = camposEmprestimo.omit({ liberarLimite: true, confirmarAtraso: true, reservaId: true, pedidoId: true }).partial()
  .extend({ devolvidoEm: dataHora.nullable().optional() }).superRefine(regras);
export const devolucaoSchema = z.object({
  devolvidoEm: dataHora.optional(), acessoriosDevolvidos: z.array(z.string()).default([]),
  assinatura: imagemBase64.optional(), obsDevolucao: textoOpcional,
});
export const resolverSchema = z.object({
  acessoriosRecebidos: z.array(z.string()).default([]),
  assinaturaDevolucao: imagemBase64.optional(), assinaturaRetirada: imagemBase64.optional(),
});
export type EmprestimoNovo = z.infer<typeof emprestimoNovoSchema>;
export type EmprestimoEdicao = z.infer<typeof emprestimoEdicaoSchema>;
export type Devolucao = z.infer<typeof devolucaoSchema>;
export type Resolver = z.infer<typeof resolverSchema>;
