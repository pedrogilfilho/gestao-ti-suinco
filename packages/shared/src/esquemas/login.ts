import { z } from 'zod';
import { emailQualquerSchema } from './comum.js';

// qualquer domínio: os donos usam também um Gmail
export const loginSchema = z.object({ email: emailQualquerSchema, senha: z.string({ required_error: 'Informe a senha.' }).min(1, 'Informe a senha.') });
export const trocarSenhaSchema = z.object({
  atual: z.string({ required_error: 'Informe a senha atual.' }).min(1, 'Informe a senha atual.'),
  nova: z.string({ required_error: 'Informe a nova senha.' }).min(8, 'A senha precisa ter pelo menos 8 caracteres.').regex(/\d/, 'A senha precisa ter pelo menos um número.'),
});
export type LoginEntrada = z.infer<typeof loginSchema>;
export type TrocarSenha = z.infer<typeof trocarSenhaSchema>;
