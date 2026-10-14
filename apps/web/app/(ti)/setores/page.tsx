'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePode } from '@/lib/usePode';
import type { Setor } from '@/lib/tipos';
import { Dialogo } from '@/components/Dialogo';
import { Campo } from '@/components/Campo';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function FormSetor({ setor, onFechar }: { setor?: Setor; onFechar: () => void }) {
  const [nome, setNome] = useState(setor?.nome ?? '');
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    try {
      if (setor) await api(`/setores/${setor.id}`, { metodo: 'PATCH', corpo: { nome } });
      else await api('/setores', { metodo: 'POST', corpo: { nome } });
      await qc.invalidateQueries({ queryKey: ['setores'] });
      avisar(setor ? 'Setor atualizado.' : 'Setor cadastrado.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível salvar.');
    }
  }
  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo rotulo="Nome do setor" erro={erro}><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus /></Campo>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}

// Excluir um setor leva as pessoas e os equipamentos dele para outro setor.
function ExcluirSetor({ setor, outros, onFechar }: { setor: Setor; outros: Setor[]; onFechar: () => void }) {
  const [destinoId, setDestinoId] = useState('');
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();
  async function excluir(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    try {
      await api(`/setores/${setor.id}`, { metodo: 'DELETE', corpo: { destinoId } });
      await Promise.all(['setores', 'pessoas', 'equipamentos'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Setor excluído.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível excluir.');
    }
  }
  return (
    <form onSubmit={excluir} className="space-y-4">
      <p>
        {setor.nome} tem {plural(setor.pessoas, 'pessoa', 'pessoas')} e {plural(setor.equipamentos, 'equipamento', 'equipamentos')}.
        Eles vão para o setor escolhido. Dá para restaurar o setor depois pela Auditoria.
      </p>
      <Campo rotulo="Mover as pessoas para" erro={erro}>
        <select className="campo" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
          <option value="">Escolha...</option>
          {outros.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Campo>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn perigo">Excluir setor</button>
      </div>
    </form>
  );
}

export default function Setores() {
  const [editando, setEditando] = useState<Setor | 'novo' | null>(null);
  const [excluindo, setExcluindo] = useState<Setor | null>(null);
  const podeEditar = usePode('usuarios'), podeExcluir = usePode('excluir');
  const q = useQuery({ queryKey: ['setores'], queryFn: () => api<{ itens: Setor[] }>('/setores') });
  const setores = q.data?.itens ?? [];

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Setores</h1>
        <div className="flex flex-wrap gap-2">
          {podeEditar && <button type="button" className="btn" onClick={() => setEditando('novo')}>Novo setor</button>}
          <Link className="btn ghost" href="/auditoria?area=setores">Auditoria</Link>
        </div>
      </header>
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar os setores.</p>}
      {q.isLoading && <p className="meta">Carregando...</p>}
      {!q.isLoading && !setores.length && <p className="meta">Nenhum setor cadastrado.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {setores.map((s) => (
          <article key={s.id} aria-label={s.nome} className="card">
            <h2 className="font-semibold">{s.nome}</h2>
            <p className="meta">
              <Link className="link" href={`/usuarios?setorId=${s.id}`}>{plural(s.pessoas, 'pessoa', 'pessoas')}</Link>
              {' · '}{plural(s.equipamentos, 'equipamento', 'equipamentos')}
            </p>
            <div className="mt-2 flex gap-3">
              {podeEditar && <button type="button" className="link" onClick={() => setEditando(s)}>Editar</button>}
              {podeExcluir && <button type="button" className="link text-[var(--late)]" onClick={() => setExcluindo(s)}>Excluir</button>}
            </div>
          </article>
        ))}
      </div>
      <Dialogo titulo={editando === 'novo' ? 'Novo setor' : 'Editar setor'} aberto={!!editando} onFechar={() => setEditando(null)} largura="max-w-md">
        {editando && <FormSetor setor={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Dialogo>
      <Dialogo titulo={`Excluir ${excluindo?.nome ?? ''}`} aberto={!!excluindo} onFechar={() => setExcluindo(null)} largura="max-w-md">
        {excluindo && <ExcluirSetor setor={excluindo} outros={setores.filter((s) => s.id !== excluindo.id)} onFechar={() => setExcluindo(null)} />}
      </Dialogo>
    </section>
  );
}
