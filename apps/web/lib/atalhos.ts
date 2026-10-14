'use client';
import { useEffect, useRef } from 'react';

// Atalho de teclado com Alt (ex.: Alt+N). Ignora quando o foco está num campo de texto.
export function useAtalho(tecla: string, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.altKey && e.key.toLowerCase() === tecla.toLowerCase()) { e.preventDefault(); ref.current(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [tecla]);
}

