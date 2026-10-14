'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export function BotaoTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  const escuro = resolvedTheme === 'dark';
  return (
    <button type="button" className="btn ghost" onClick={() => setTheme(escuro ? 'light' : 'dark')} aria-label={escuro ? 'Tema claro' : 'Tema escuro'}>
      {escuro ? '☀' : '☾'}
    </button>
  );
}
