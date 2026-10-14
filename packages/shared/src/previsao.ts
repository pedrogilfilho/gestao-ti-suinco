import { diaSP } from './datas.js';

// Previsão de entrega sugerida: dia da retirada (em Brasília) + dias da finalidade, na hora da finalidade.
// Brasília não tem horário de verão desde 2019, por isso o -03:00 fixo.
export function previsaoSugerida(retirada: Date, fin: { dias: number; hora: string }): Date {
  const [a, m, d] = diaSP(retirada).split('-').map(Number) as [number, number, number];
  const dia = new Date(Date.UTC(a, m - 1, d + fin.dias, 12)).toISOString().slice(0, 10);
  return new Date(`${dia}T${fin.hora}:00-03:00`);
}

// Quantos equipamentos do tipo a pessoa pode ter ao mesmo tempo: 1, ou o personalizado (1 a 50).
export function limiteDe(limites: unknown, tipo: string): number {
  const n = Number((limites as Record<string, unknown> | null)?.[tipo]);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 1;
}
