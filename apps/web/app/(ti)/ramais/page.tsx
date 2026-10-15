'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePode } from '@/lib/usePode';
import { usePerguntar } from '@/lib/pergunta';
import type { Ramal } from '@/lib/tipos';
import { Dialogo } from '@/components/Dialogo';
import { Campo } from '@/components/Campo';

type Lista = { itens: Ramal[]; setores: string[] };

function FormRamal({ ramal, onFechar }: { ramal?: Ramal; onFechar: () => void }) {
  const [f, setF] = useState({ numero: ramal?.numero ?? '', descricao: ramal?.descricao ?? '', setor: ramal?.setor ?? '' });
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();
  const mudar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    try {
      if (ramal) await api(`/ramais/${ramal.id}`, { metodo: 'PATCH', corpo: f });
      else await api('/ramais', { metodo: 'POST', corpo: f });
      await qc.invalidateQueries({ queryKey: ['ramais'] });
      avisar(ramal ? 'Ramal atualizado.' : 'Ramal cadastrado.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível salvar.');
    }
  }
  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo rotulo="Ramal" erro={erro}><input className="campo" value={f.numero} onChange={(e) => mudar('numero', e.target.value)} required autoFocus /></Campo>
      <Campo rotulo="Descrição"><input className="campo" value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} placeholder="Ex.: Recepção, Ana Reis" /></Campo>
      <Campo rotulo="Setor"><input className="campo" value={f.setor} onChange={(e) => mudar('setor', e.target.value)} /></Campo>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}

export default function Ramais() {
  const [q, setQ] = useState('');
  const [setor, setSetor] = useState('');
  const [editando, setEditando] = useState<Ramal | 'novo' | null>(null);
  const podeEditar = usePode('usuarios'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();

  const query = useQuery({
    queryKey: ['ramais', q, setor],
    queryFn: () => api<Lista>(`/ramais?${new URLSearchParams({ ...(q && { q }), ...(setor && { setor }) })}`),
  });
  const itens = query.data?.itens ?? [];
  const setores = query.data?.setores ?? [];

  async function excluir(r: Ramal) {
    if (!(await perguntar(`Excluir o ramal ${r.numero}${r.descricao ? ` (${r.descricao})` : ''}? Dá para restaurar depois pela Auditoria.`, 'Excluir', { titulo: 'Excluir ramal', perigo: true }))) return;
    try {
      await api(`/ramais/${r.id}`, { metodo: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['ramais'] });
      avisar('Ramal excluído.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível excluir.');
    }
  }

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Ramais</h1>
        <div className="flex flex-wrap gap-2">
          {podeEditar && <button type="button" className="btn" onClick={() => setEditando('novo')}>Novo ramal</button>}
          <Link className="btn ghost" href="/auditoria?area=ramais">Auditoria</Link>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="campo max-w-xs" placeholder="Buscar por ramal, descrição ou setor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ramal" />
        <select className="campo max-w-[12rem]" value={setor} onChange={(e) => setSetor(e.target.value)} aria-label="Filtrar por setor">
          <option value="">Todos os setores</option>
          {setores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {query.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar os ramais.</p>}
      {query.isLoading && <p className="meta">Carregando...</p>}
      {!query.isLoading && !itens.length && <p className="meta">Nenhum ramal cadastrado.</p>}
      {itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left meta"><th className="py-2 pr-4">Ramal</th><th className="py-2 pr-4">Descrição</th><th className="py-2 pr-4">Setor</th><th /></tr></thead>
            <tbody>
              {itens.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-4 font-semibold">{r.numero}</td>
                  <td className="py-2 pr-4">{r.descricao || '—'}</td>
                  <td className="py-2 pr-4">{r.setor || '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {podeEditar && <button type="button" className="link" onClick={() => setEditando(r)}>Editar</button>}
                    {podeExcluir && <button type="button" className="link ml-3 text-[var(--late)]" onClick={() => excluir(r)}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo titulo={editando === 'novo' ? 'Novo ramal' : 'Editar ramal'} aberto={!!editando} onFechar={() => setEditando(null)} largura="max-w-md">
        {editando && <FormRamal ramal={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Dialogo>
    </section>
  );
}
