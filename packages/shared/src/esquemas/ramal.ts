import { z } from 'zod';

// Ramal: número, descrição e setor (texto livre). Não liga a pessoa (decisão 15/10/2026).
export const ramalSchema = z.object({
  numero: z.string({ required_error: 'Informe o ramal.' }).trim().min(1, 'Informe o ramal.').max(20),
  descricao: z.string().trim().max(200).default(''),
  setor: z.string().trim().max(120).transform((s) => s.replace(/\s+/g, ' ')).default(''),
});
export type RamalEntrada = z.infer<typeof ramalSchema>;
