import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

export const gerarHash = (s: string) => argon2.hash(s, { type: argon2.argon2id });
export const confere = (hash: string, s: string) => argon2.verify(hash, s).catch(() => false);

// 6 letras + 2 números, sem caracteres que se confundem (I, l, O, 0, 1)
export function senhaTemporaria(): string {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz', nums = '23456789';
  const pick = (s: string) => s[randomInt(s.length)]!;
  return Array.from({ length: 6 }, () => pick(letras)).join('') + pick(nums) + pick(nums);
}

export const ehDono = (email: string) =>
  (process.env.DONOS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
