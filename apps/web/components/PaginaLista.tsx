'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Coluna<T> = { titulo: string; celula: (i: T) => ReactNode };

// Padrão de todas as listas: cabeçalho + filtros + tabela (computador) / cartões (celular) + "Carregar mais" + Auditoria da aba.
export function PaginaLista<T extends { id: string }>(p: {
  titulo: string; area: string; caminho: string; filtros: Record<string, string>;
  colunas: Coluna<T>[]; nomeLinha: (i: T) => string; cartao: (i: T) => ReactNode;
  topo?: ReactNode; acoesTopo?: ReactNode; auditoriaArea?: string; vazio?: string;
}) {
  const qs = new URLSearchParams(Object.entries(p.filtros).filter(([, v]) => v)).toString();
  const q = useInfiniteQuery({
    queryKey: [p.area, p.filtros],
    queryFn: ({ pageParam }) => api<{ itens: T[]; proximo: string | null }>(`${p.caminho}?${qs}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (u) => u.proximo ?? undefined,
  });
  const itens = q.data?.pages.flatMap((pg) => pg.itens) ?? [];

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{p.titulo}</h1>
        <div className="flex flex-wrap gap-2">
          {p.acoesTopo}
          {p.auditoriaArea && <Link className="btn ghost" href={`/auditoria?area=${p.auditoriaArea}`}>Auditoria</Link>}
        </div>
      </header>
      {p.topo && <div className="mb-4 space-y-3">{p.topo}</div>}
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar a lista.</p>}
      <div className="overflow-x-auto max-md:hidden">
        <table className="tabela">
          <thead><tr>{p.colunas.map((c) => <th key={c.titulo}>{c.titulo}</th>)}</tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} aria-label={p.nomeLinha(i)}>{p.colunas.map((c) => <td key={c.titulo}>{c.celula(i)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {itens.map((i) => <article key={i.id} aria-label={p.nomeLinha(i)} className="card">{p.cartao(i)}</article>)}
      </div>
      {q.isLoading && <p className="meta mt-4">Carregando...</p>}
      {!q.isLoading && !itens.length && <p className="meta mt-4">{p.vazio ?? 'Nada encontrado.'}</p>}
      {q.hasNextPage && <button type="button" className="btn ghost mt-4" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Carregar mais</button>}
    </section>
  );
}
