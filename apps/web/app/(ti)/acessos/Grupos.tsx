'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOMES_PERMISSAO, PERMISSOES, type Permissao } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { Campo } from '@/components/Campo';
import { Dialogo } from '@/components/Dialogo';
import { Permissoes } from './Permissoes';
import type { Grupo } from './tipos';

function FormGrupo({ grupo, onFechar }: { grupo?: Grupo; onFechar: () => void }) {
  const [nome, setNome] = useState(grupo?.nome ?? '');
  const [perms, setPerms] = useState<Partial<Record<Permissao, boolean>>>(grupo?.permissoes ?? {});
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    try {
      if (grupo) await api(`/grupos/${grupo.id}`, { metodo: 'PATCH', corpo: { nome, permissoes: perms } });
      else await api('/grupos', { metodo: 'POST', corpo: { nome, permissoes: perms } });
      await Promise.all(['grupos', 'acessos'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar(grupo ? 'Grupo atualizado.' : 'Grupo criado.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível salvar.');
    }
  }
  return (
    <form onSubmit={salvar} className="space-y-3">
      <Campo rotulo="Nome do grupo" erro={erro}><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} required /></Campo>
      <Permissoes valor={perms} onChange={setPerms} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}

// Grupos de permissões: várias pessoas com o mesmo conjunto de permissões.
export function Grupos() {
  const [editando, setEditando] = useState<Grupo | 'novo' | null>(null);
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const { data } = useQuery({ queryKey: ['grupos'], queryFn: () => api<{ itens: Grupo[] }>('/grupos') });
  async function remover(g: Grupo) {
    const extra = g.pessoas ? ` ${g.pessoas} pessoa(s) voltam a usar as permissões do próprio perfil.` : '';
    if (!(await perguntar(`Remover o grupo ${g.nome}?${extra}`, 'Remover', { perigo: true }))) return;
    try {
      await api(`/grupos/${g.id}`, { metodo: 'DELETE' });
      await Promise.all(['grupos', 'acessos'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Grupo removido.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível remover.');
    }
  }
  return (
    <section>
      <div className="mb-3 flex justify-end"><button type="button" className="btn" onClick={() => setEditando('novo')}>Novo grupo</button></div>
      {!data?.itens.length && <p className="meta">Nenhum grupo criado.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data?.itens.map((g) => (
          <article key={g.id} aria-label={g.nome} className="card">
            <h2 className="font-semibold">{g.nome}</h2>
            <p className="meta text-sm">{PERMISSOES.filter((p) => g.permissoes[p]).map((p) => NOMES_PERMISSAO[p]).join(', ') || 'Sem permissões'}</p>
            <p className="meta text-sm">{g.pessoas} pessoa(s)</p>
            <div className="mt-2 flex gap-3">
              <button type="button" className="link" onClick={() => setEditando(g)}>Editar</button>
              <button type="button" className="link text-[var(--late)]" onClick={() => remover(g)}>Remover</button>
            </div>
          </article>
        ))}
      </div>
      <Dialogo titulo={editando === 'novo' ? 'Novo grupo' : 'Editar grupo'} aberto={!!editando} onFechar={() => setEditando(null)} largura="max-w-lg">
        {editando && <FormGrupo grupo={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Dialogo>
    </section>
  );
}
