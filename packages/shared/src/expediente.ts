import { diaSP, horaSP } from './datas.js';

// Horário de atendimento da TI. Dias: 0 = domingo ... 6 = sábado. Horas em Brasília, bordas inclusivas (como no app atual).
export type Expediente = { ligado: boolean; dias: number[]; inicio: string; fim: string };

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const diaSeguinte = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
// Brasília não tem horário de verão desde 2019
const emSP = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

export function dentroExpediente(e: Expediente, d: Date): boolean {
  if (!e.ligado) return true;
  const hm = horaSP(d);
  return e.dias.includes(diaDaSemana(diaSP(d))) && hm >= e.inicio && hm <= e.fim;
}

// Primeiro momento de atendimento a partir de `aPartir` (ele mesmo, se já está no expediente). Procura 14 dias.
export function proximoUtil(e: Expediente, aPartir: Date): Date | null {
  let dia = diaSP(aPartir);
  for (let i = 0; i < 14; i++, dia = diaSeguinte(dia)) {
    if (!e.dias.includes(diaDaSemana(dia))) continue;
    const hm = i === 0 ? horaSP(aPartir) : '00:00';
    if (hm < e.inicio) return emSP(dia, e.inicio);
    if (hm <= e.fim) return aPartir;
  }
  return null;
}

// "segunda a sexta, das 07:30 às 17:30" ou "segunda, quarta, sexta, das 07:30 às 17:30"
export function textoExpediente(e: Expediente): string {
  const ds = [...e.dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const seguidos = ds.length > 2 && ds.every((d, i) => i === 0 || (d + 6) % 7 === ((ds[i - 1]! + 6) % 7) + 1);
  const dias = seguidos ? `${NOMES_DIA[ds[0]!]} a ${NOMES_DIA[ds[ds.length - 1]!]}` : ds.map((d) => NOMES_DIA[d]).join(', ');
  return `${dias}, das ${e.inicio} às ${e.fim}`;
}
