import { z } from 'zod';
import { TIPOS_EQUIP, ACESSORIOS_PADRAO, FINALIDADES_PADRAO } from '../constantes.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  // módulo 2: horário de atendimento da TI (vale para os pedidos dos colaboradores) e antecedência mínima da retirada
  expediente: z.object({
    ligado: z.boolean(),
    dias: z.array(z.number().int().min(0).max(6)),
    inicio: z.string().regex(HORA, 'Hora no formato HH:MM.'),
    fim: z.string().regex(HORA, 'Hora no formato HH:MM.'),
  }).refine((e) => e.fim > e.inicio, { message: 'O fim do expediente precisa ser depois do início.', path: ['fim'] })
    .default({ ligado: false, dias: [1, 2, 3, 4, 5], inicio: '07:30', fim: '17:30' }),
  antecedenciaMin: z.number().int().min(0, 'A antecedência vai de 0 a 1440 minutos.').max(1440, 'A antecedência vai de 0 a 1440 minutos.').default(15),
  // módulo 3: termos (texto vazio = padrão; prazo 0 = sem prazo)
  termoAuto: z.boolean().default(true),
  prazoTermoDias: z.number().int().min(0, 'O prazo vai de 0 a 90 dias.').max(90, 'O prazo vai de 0 a 90 dias.').default(7),
  termoTxtEmp: z.string().default(''),
  termoTxtResp: z.string().default(''),
});
export type ConfigNucleo = z.infer<typeof configNucleoSchema>;
