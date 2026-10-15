import { z } from 'zod';
import { dataHora, textoOpcional, uuidObrigatorio } from './comum.js';

const campos = z.object({
  pessoaId: uuidObrigatorio('Selecione o usuário.'),
  equipamentoId: uuidObrigatorio('Escolha o equipamento.'),
  inicioEm: dataHora,
  fimEm: dataHora,
  // devolução prevista quando passa do horário final (reserva de vários dias); vazio = fimEm
  devolucaoEm: dataHora.nullable().optional(),
  finalidade: z.string().trim().max(80).optional().default(''),
  finalidadeOutra: textoOpcional,
  chamadoGlpi: z.string().trim().regex(/^\d*$/, 'O chamado GLPI aceita só números.').optional().default(''),
  obs: textoOpcional,
  liberarLimite: z.boolean().optional(),
  liberarAtraso: z.boolean().optional(),
});

const regras = (r: { inicioEm: Date; fimEm: Date; devolucaoEm?: Date | null; finalidade?: string; finalidadeOutra?: string }, ctx: z.RefinementCtx) => {
  if (r.fimEm <= r.inicioEm) ctx.addIssue({ code: 'custom', path: ['fimEm'], message: 'O horário final precisa ser depois do inicial.' });
  if (r.devolucaoEm && r.devolucaoEm < r.fimEm) ctx.addIssue({ code: 'custom', path: ['devolucaoEm'], message: 'A devolução precisa ser depois do horário final.' });
  if (r.finalidade === 'Outra' && !r.finalidadeOutra) ctx.addIssue({ code: 'custom', path: ['finalidadeOutra'], message: 'Digite o motivo da reserva.' });
};

export const reservaSchema = campos.superRefine(regras);
export const reservaEdicaoSchema = campos.omit({ liberarLimite: true, liberarAtraso: true }).superRefine(regras);
export type ReservaEntrada = z.infer<typeof reservaSchema>;
export type ReservaEdicao = z.infer<typeof reservaEdicaoSchema>;
