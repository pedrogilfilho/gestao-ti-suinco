'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Situacao } from '@gestao/shared';
import { api } from '@/lib/api';
import { dataHoraBR } from '@/lib/tipos';
import { Selo } from '@/components/Selo';
import { useEu } from '@/lib/sessao';
import type { Config } from '@/lib/tipos';
import { AvisoExpediente, FormPedido } from './FormPedido';
import { MinhasSolicitacoes, type MeuPedido } from './MinhasSolicitacoes';

type Meus = {
  emprestimos: { id: string; equipamento: { codigo: string; tipo: string; modelo: string }; retiradaEm: string; previsaoEm: string | null; acessorios: string[]; situacao: Situacao }[];
  vinculados: { id: string; codigo: string; tipo: string; modelo: string }[];
};

// O que está com o colaborador: empréstimos abertos e equipamentos vinculados a ele.
function MeusEquipamentos() {
  const q = useQuery({ queryKey: ['emprestimos', 'meus'], queryFn: () => api<Meus>('/meus-emprestimos') });
  const vazio = q.data && !q.data.emprestimos.length && !q.data.vinculados.length;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Meus equipamentos</h2>
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

// Pedido de empréstimo e acompanhamento: só para o colaborador (a TI não faz pedido, ela fornece).
function Pedidos() {
  const [editando, setEditando] = useState<MeuPedido | null>(null);
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') });
  const { data: meus } = useQuery({ queryKey: ['pedidos', 'meus'], queryFn: () => api<{ itens: MeuPedido[]; telefones: { corp: string | null; part: string | null } }>('/pedidos/meus') });
  return (
    <>
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">{editando ? 'Editando seu pedido' : 'Solicitar empréstimo de equipamento'}</h1>
        {config && <AvisoExpediente config={config} />}
        {config && meus && (
          <FormPedido key={editando?.id ?? 'novo'} config={config} telefones={meus.telefones} editando={editando} onFimEdicao={() => setEditando(null)} />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Minhas solicitações</h2>
        {meus && <MinhasSolicitacoes itens={meus.itens} onEditar={(p) => { setEditando(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
      </section>
    </>
  );
}

export default function PaginaPortal() {
  const { eu } = useEu();
  return (
    <div className="space-y-8">
      {eu?.papel === 'solicitante' && <Pedidos />}
      <MeusEquipamentos />
    </div>
  );
}
