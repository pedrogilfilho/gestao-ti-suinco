import { diaSP, horaSP } from '@gestao/shared';

// <input type="datetime-local"> sempre no horário de Brasília (sem horário de verão desde 2019).
export const paraCampo = (d: Date) => `${diaSP(d)}T${horaSP(d)}`;
export const deCampo = (v: string) => new Date(`${v}:00-03:00`);
