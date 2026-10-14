'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ItemMenu = { rotulo: string; acao: () => void; perigo?: boolean } | { rotulo: string; href: string };

// Menu ⋮ "Mais ações". Fecha ao escolher, ao clicar fora ou com Esc.
export function MenuAcoes({ itens, rotulo = 'Mais ações' }: { itens: ItemMenu[]; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const item = (i: ItemMenu): ReactNode => ('href' in i
    ? <a role="menuitem" href={i.href} className="block px-3 py-2 hover:bg-[var(--tag)]">{i.rotulo}</a>
    : <button type="button" role="menuitem" className={`block w-full px-3 py-2 text-left hover:bg-[var(--tag)] ${i.perigo ? 'text-[var(--late)]' : ''}`} onClick={() => { setAberto(false); i.acao(); }}>{i.rotulo}</button>);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" className="btn ghost px-2" aria-label={rotulo} aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>⋮</button>
      {aberto && (
        <div role="menu" className="card absolute right-0 z-30 mt-1 min-w-52 p-0 py-1">
          {itens.map((i) => <div key={i.rotulo}>{item(i)}</div>)}
        </div>
      )}
    </div>
  );
}
