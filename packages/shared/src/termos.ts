import { diaSP, diasEntre } from './datas.js';
import type { ConfigNucleo } from './esquemas/config.js';

// Textos padrão do app atual (TXT_TERMO_EMP_PAD e TXT_TERMO_RESP_PAD).
export const TXT_TERMO_EMP_PAD = 'Declaro que recebi da TI (TIC) da Suinco o equipamento e os acessórios descritos acima, em perfeito estado de funcionamento. Comprometo-me a utilizá-los exclusivamente para fins profissionais, zelar por sua guarda e conservação, não emprestá-los a terceiros e devolvê-los até a data prevista. Em caso de defeito, dano, perda ou extravio, comunicarei imediatamente a TI. Estou ciente de que danos causados por mau uso ou negligência poderão ser apurados conforme as normas internas da empresa.';
export const TXT_TERMO_RESP_PAD = 'Declaro que recebi da TI (TIC) da Suinco os equipamentos descritos acima, em perfeito estado de funcionamento, para uso exclusivamente profissional. Comprometo-me a zelar por sua guarda e conservação, não cedê-los a terceiros, comunicar imediatamente à TI qualquer defeito, dano, perda, roubo ou extravio e devolvê-los quando solicitado ou ao término do meu vínculo com a empresa. Estou ciente de que danos causados por mau uso ou negligência poderão ser apurados conforme as normas internas da empresa.';

export type DadosTermo = { nome?: string | null; setor?: string | null; data?: string | null; email?: string | null };

export const preencherTermo = (txt: string, v: DadosTermo) =>
  txt.replace(/\{(nome|setor|data|email)\}/gi, (_m, k: string) => String(v[k.toLowerCase() as keyof DadosTermo] ?? ''));

export function textoTermo(cfg: Pick<ConfigNucleo, 'termoTxtEmp' | 'termoTxtResp'>, tipo: 'emp' | 'resp', v: DadosTermo) {
  const t = (tipo === 'emp' ? cfg.termoTxtEmp : cfg.termoTxtResp).trim() || (tipo === 'emp' ? TXT_TERMO_EMP_PAD : TXT_TERMO_RESP_PAD);
  return preencherTermo(t, v);
}

const dataBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// Descrição do item no termo (app atual: descAtivo).
export function descAtivo(q: {
  tipo: string; modelo?: string | null; patrimonio?: string | null; serie?: string | null;
  tipoChip?: string | null; numeroCorp?: string | null; numeroPart?: string | null; dataAtivacao?: Date | string | null;
}): string {
  const j = (xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(' · ');
  if (q.tipo === 'Chip')
    return j([q.tipoChip, j([q.numeroCorp && 'Corporativo ' + q.numeroCorp, q.numeroPart && 'Particular ' + q.numeroPart])]);
  if (q.tipo === 'Celular') return j([q.modelo, q.dataAtivacao && 'ativação ' + dataBR(new Date(q.dataAtivacao))]);
  return j([q.modelo, q.patrimonio && 'patr. ' + q.patrimonio, q.serie && 'série ' + q.serie]);
}

export type TermoStatus = 'assinado' | 'nao_assinado' | 'nao_informado';

// Dias além do prazo desde o vínculo, contados pelo dia de São Paulo; prazo 0 = sem prazo.
export function diasAtrasoTermo(q: { termoStatus: TermoStatus; vinculadoEm: Date | null }, prazo: number, agora: Date): number {
  if (!prazo || q.termoStatus === 'assinado' || !q.vinculadoEm) return 0;
  const d = diasEntre(diaSP(q.vinculadoEm), diaSP(agora)) - prazo;
  return d > 0 ? d : 0;
}

export function estadoTermo(itens: { termoStatus: TermoStatus }[]): 'pend' | 'sem' | 'ok' {
  if (itens.some((i) => i.termoStatus === 'nao_assinado')) return 'pend';
  return itens.some((i) => i.termoStatus === 'nao_informado') ? 'sem' : 'ok';
}
