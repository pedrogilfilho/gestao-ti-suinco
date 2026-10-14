import { z } from 'zod';
import { TIPOS_EQUIP, TIPOS_COM_IP, TIPOS_LOCAL_FIXO, SITUACOES, TERMO_STATUS, type TipoEquip } from '../constantes.js';
import { telefoneOpcional, textoOpcional } from './comum.js';

const ipValido = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((n) => +n <= 255);

export const equipamentoSchema = z.object({
  codigo: z.string({ required_error: 'Informe o Nome do equipamento.' }).trim().min(1, 'Informe o Nome do equipamento.').max(60),
  tipo: z.enum(TIPOS_EQUIP, { errorMap: () => ({ message: 'Tipo de equipamento inválido.' }) }),
  modelo: textoOpcional, patrimonio: textoOpcional, serie: textoOpcional, obs: textoOpcional,
  situacao: z.enum(SITUACOES).default('ativo'),
  somenteCadastro: z.boolean().default(false),
  pessoaId: z.string().uuid('Escolha um colaborador cadastrado.').nullable().optional(),
  vinculoLivre: textoOpcional,
  setorId: z.string().uuid().nullable().optional(),
  ipTipo: z.enum(['dhcp', 'fixo']).nullable().optional(),
  ip: z.string().trim().optional(),
  mac: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/, 'MAC incompleto. Formato: AA:BB:CC:DD:EE:FF.')]).optional(),
  numeroCorp: telefoneOpcional, numeroPart: telefoneOpcional,
  tipoChip: textoOpcional,
  termoStatus: z.enum(TERMO_STATUS).default('nao_informado'),
  termoObs: textoOpcional,
  garantiaAte: z.coerce.date().nullable().optional(),
  predio: textoOpcional, pontoRede: textoOpcional, firmware: textoOpcional,
  trocasCabeca: z.number().int().min(0).nullable().optional(),
  licencas: z.array(z.object({ nome: z.string().trim(), chave: z.string().trim() })).default([]),
  dataAtivacao: z.coerce.date().nullable().optional(),
}).superRefine((e, ctx) => {
  const temIp = TIPOS_COM_IP.includes(e.tipo as TipoEquip);
  if (!temIp && (e.ipTipo || e.ip || e.mac)) ctx.addIssue({ code: 'custom', path: ['ipTipo'], message: 'Esse tipo de equipamento não tem IP.' });
  if (e.ipTipo === 'fixo' && (!e.ip || !ipValido(e.ip))) ctx.addIssue({ code: 'custom', path: ['ip'], message: 'Informe um IP válido.' });
  if (e.pessoaId && e.vinculoLivre) ctx.addIssue({ code: 'custom', path: ['vinculoLivre'], message: 'Vincule a um colaborador ou a um texto, não aos dois.' });
}).transform((e) => {
  // equipamento de local fixo (câmera, switch, telefone IP) não se vincula a ninguém
  const local = TIPOS_LOCAL_FIXO.includes(e.tipo as TipoEquip);
  return { ...e, pessoaId: local ? null : e.pessoaId ?? null, vinculoLivre: local ? '' : e.vinculoLivre };
});
export const equipamentosLoteSchema = z.object({ linhas: z.array(z.unknown()).min(1, 'Cole pelo menos uma linha.').max(500, 'No máximo 500 linhas por vez.') });
export type EquipamentoEntrada = z.infer<typeof equipamentoSchema>;
