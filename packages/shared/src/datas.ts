const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });

export const diaSP = (d: Date): string => fmtDia.format(d);
export const horaSP = (d: Date): string => fmtHora.format(d);
export function diasEntre(diaA: string, diaB: string): number {
  return Math.round((Date.parse(diaB + 'T12:00:00Z') - Date.parse(diaA + 'T12:00:00Z')) / 86_400_000);
}
