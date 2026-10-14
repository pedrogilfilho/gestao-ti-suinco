import { z } from 'zod';
import { TIPOS_EQUIP, ACESSORIOS_PADRAO, FINALIDADES_PADRAO } from '../constantes.js';

export const configNucleoSchema = z.object({
  tiposEmprestaveis: z.array(z.enum(TIPOS_EQUIP)).min(1, 'Escolha pelo menos um tipo de equipamento de empréstimo.').default(['Notebook Empréstimo']),
  acessorios: z.array(z.string().trim().min(1)).default(ACESSORIOS_PADRAO),
  finalidades: z.array(z.object({
    nome: z.string().trim().min(1, 'Informe o nome da finalidade.'),
    dias: z.number().int().min(0).max(365),
    hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora no formato HH:MM.'),
  })).default(FINALIDADES_PADRAO),
  bloqueioAtraso: z.boolean().default(true),
  assinaturas: z.boolean().default(true),
  glpiUrl: z.string().trim().url('Endereço do GLPI inválido.').or(z.literal('')).default(''),
  // aviso de vencimento em minutos; abaixo de 5 vira 5 (como no app atual)
  avisoMin: z.number().int().default(120).transform((n) => Math.max(5, n)),
});
export type ConfigNucleo = z.infer<typeof configNucleoSchema>;
