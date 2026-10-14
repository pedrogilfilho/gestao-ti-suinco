'use client';
import { useEffect, useState } from 'react';

// Campo de busca que só manda para a URL depois que a pessoa para de digitar.
export function Busca({ valor, onChange, placeholder = 'Buscar' }: { valor: string; onChange: (v: string) => void; placeholder?: string }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  useEffect(() => {
    if (texto === valor) return;
    const t = setTimeout(() => onChange(texto), 300);
    return () => clearTimeout(t);
  }, [texto, valor, onChange]);
  return <input type="search" className="campo max-w-md" placeholder={placeholder} aria-label={placeholder} value={texto} onChange={(e) => setTexto(e.target.value)} />;
}
