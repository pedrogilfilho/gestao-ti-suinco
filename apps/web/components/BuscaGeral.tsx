'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Item = { id: string; t: string; sub: string; ir: string };
type Grupo = { nome: string; total: number; itens: Item[] };

// Busca em tudo (equipamentos, pessoas, empréstimos). "/" foca; setas + Enter escolhem; Esc fecha.
export function BuscaGeral() {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  useEffect(() => { const t = setTimeout(() => setQ(texto.trim()), 250); return () => clearTimeout(t); }, [texto]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== '/' || alvo?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const { data } = useQuery({
    queryKey: ['busca', q], enabled: q.length >= 2,
    queryFn: () => api<{ grupos: Grupo[] }>(`/busca?q=${encodeURIComponent(q)}`),
  });
  const itens = data?.grupos.flatMap((g) => g.itens) ?? [];
  useEffect(() => setAtivo(0), [data]);

  const ir = (i: Item) => {
    setAberto(false); setTexto('');
    ref.current?.blur();
    router.push(i.ir);
  };
  const mostrar = aberto && q.length >= 2 && !!data;
  let n = -1;

  return (
    <div className="relative w-full max-w-md">
      <input
        ref={ref} className="campo" role="combobox" aria-label="Busca geral" aria-expanded={mostrar} aria-controls={`${id}-lista`} autoComplete="off"
        placeholder="Busca geral: nome, e-mail, telefone, patrimônio, chip, empréstimo...  (atalho: /)"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setAberto(false); ref.current?.blur(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, itens.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && itens[ativo]) { e.preventDefault(); ir(itens[ativo]); }
        }}
      />
      {mostrar && (
        <div id={`${id}-lista`} role="listbox" aria-label="Resultados da busca" className="card absolute z-50 mt-1 max-h-96 w-full overflow-y-auto p-0">
          {!itens.length && <p className="meta px-3 py-2">Nada encontrado.</p>}
          {data.grupos.map((g) => (
            <div key={g.nome} role="group" aria-label={g.nome}>
              <p className="meta px-3 pt-2 text-xs font-semibold uppercase">{g.nome}{g.total > g.itens.length ? ` (${g.itens.length} de ${g.total})` : ''}</p>
              {g.itens.map((i) => {
                n += 1;
                const k = n;
                return (
                  <div
                    key={i.id} role="option" aria-selected={k === ativo}
                    className={`cursor-pointer px-3 py-2 ${k === ativo ? 'bg-[var(--tag)]' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => ir(i)} onMouseEnter={() => setAtivo(k)}
                  >
                    <span className="block">{i.t}</span>
                    {i.sub && <span className="meta block text-sm">{i.sub}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
