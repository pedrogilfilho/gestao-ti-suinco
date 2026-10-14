import { z } from 'zod';
import { PAPEIS, PERMISSOES } from '../permissoes.js';

const marcadas = z.record(z.enum(PERMISSOES), z.boolean()).default({});
export const acessoNovoSchema = z.object({
  pessoaId: z.string({ required_error: 'Escolha a pessoa.' }).uuid('Escolha a pessoa.'),
  papel: z.enum(PAPEIS, { errorMap: () => ({ message: 'Escolha o perfil.' }) }),
  grupoId: z.string().uuid().nullable().optional(),
  permissoes: marcadas,
});
export const acessoEdicaoSchema = acessoNovoSchema.omit({ pessoaId: true }).partial();
export const grupoSchema = z.object({ nome: z.string({ required_error: 'Informe o nome do grupo.' }).trim().min(1, 'Informe o nome do grupo.').max(80), permissoes: marcadas });
export type AcessoNovo = z.infer<typeof acessoNovoSchema>;
export type AcessoEdicao = z.infer<typeof acessoEdicaoSchema>;
export type GrupoEntrada = z.infer<typeof grupoSchema>;
