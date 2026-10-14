import { z } from 'zod';
import { emailSchema, telefoneOpcional, imagemBase64, fotoBase64, uuidObrigatorio } from './comum.js';
import { PAPEIS } from '../permissoes.js';

export const pessoaSchema = z.object({
  nome: z.string({ required_error: 'Informe o nome.' }).trim().min(1, 'Informe o nome.').max(160),
  email: emailSchema,
  setorId: uuidObrigatorio('Selecione o setor.'),
  telefoneCorp: telefoneOpcional,
  telefonePart: telefoneOpcional,
  login: z.string().trim().max(80).optional().default(''),
  assinatura: imagemBase64.optional(),
  apagarAssinatura: z.boolean().optional(),
  foto: fotoBase64.optional(),
  apagarFoto: z.boolean().optional(),
});
export const pessoaEdicaoSchema = pessoaSchema.omit({ email: true }).extend({
  limites: z.record(z.string(), z.number().int().min(1, 'O limite vai de 1 a 50.').max(50, 'O limite vai de 1 a 50.')).optional(),
});
// linha do "colar lista": email;nome;setor;perfil (setor pelo nome; perfil opcional)
export const pessoaLinhaSchema = z.object({
  email: emailSchema,
  nome: z.string().trim().min(1, 'Informe o nome.').max(160),
  setor: z.string().trim().min(1, 'Informe o setor.'),
  perfil: z.enum(PAPEIS).optional(),
});
// o lote valida linha por linha no serviço
export const pessoasLoteSchema = z.object({ linhas: z.array(z.unknown()).min(1, 'Cole pelo menos uma linha.').max(500, 'No máximo 500 linhas por vez.') });
export const desativarSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const minhaFotoSchema = z.object({ foto: fotoBase64.optional(), apagarFoto: z.boolean().optional() });
export type PessoaEntrada = z.infer<typeof pessoaSchema>;
export type PessoaEdicao = z.infer<typeof pessoaEdicaoSchema>;
export type PessoaLinha = z.infer<typeof pessoaLinhaSchema>;
