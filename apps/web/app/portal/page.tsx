'use client';
import { useQuery } from '@tanstack/react-query';
import type { Situacao } from '@gestao/shared';
import { api } from '@/lib/api';
import { dataHoraBR } from '@/lib/tipos';
import { Selo } from '@/components/Selo';

type Meus = {
  emprestimos: { id: string; equipamento: { codigo: string; tipo: string; modelo: string }; retiradaEm: string; previsaoEm: string | null; acessorios: string[]; situacao: Situacao }[];
  vinculados: { id: string; codigo: string; tipo: string; modelo: string }[];
};

// O que está com o colaborador: empréstimos abertos e equipamentos vinculados a ele.
export default function PaginaPortal() {
  const q = useQuery({ queryKey: ['emprestimos', 'meus'], queryFn: () => api<Meus>('/meus-emprestimos') });
  const vazio = q.data && !q.data.emprestimos.length && !q.data.vinculados.length;
  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Meus equipamentos</h1>
      {q.isLoading && <p className="meta">Carregando...</p>}
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar.</p>}
      {vazio && <p className="meta">Nenhum equipamento com você.</p>}
      <div className="grid gap-3">
        {q.data?.emprestimos.map((e) => (
          <article key={e.id} aria-label={e.equipamento.codigo} className="card">
            <div className="flex items-start justify-between gap-2"><b>{e.equipamento.codigo}</b><Selo s={e.situacao} /></div>
            <p className="meta">{[e.equipamento.tipo, e.equipamento.modelo].filter(Boolean).join(' · ')}</p>
            <p className="text-sm">Emprestado em {dataHoraBR(e.retiradaEm)} · Devolver até <b>{dataHoraBR(e.previsaoEm)}</b></p>
            {e.acessorios.length > 0 && <p className="meta text-sm">Com: {e.acessorios.join(', ')}</p>}
          </article>
        ))}
        {q.data?.vinculados.map((v) => (
          <article key={v.id} aria-label={v.codigo} className="card">
            <div className="flex items-start justify-between gap-2"><b>{v.codigo}</b><span className="selo out">Vinculado a você</span></div>
            <p className="meta">{[v.tipo, v.modelo].filter(Boolean).join(' · ')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
