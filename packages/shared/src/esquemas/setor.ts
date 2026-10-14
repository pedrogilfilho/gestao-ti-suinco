import { z } from 'zod';
import { uuidObrigatorio } from './comum.js';

export const setorSchema = z.object({
  nome: z.string({ required_error: 'Informe o nome do setor.' }).trim().min(1, 'Informe o nome do setor.').max(120).transform((s) => s.replace(/\s+/g, ' ')),
});
export const excluirSetorSchema = z.object({ destinoId: uuidObrigatorio('Escolha o setor de destino.') });
export type SetorEntrada = z.infer<typeof setorSchema>;

// chave de comparação de nomes: sem maiúsculas e sem acento ("Finançeiro" = "financeiro")
export const chaveNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
