'use client';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import type { Pessoa, Setor } from '@/lib/tipos';
import { PaginaLista, type Coluna } from '@/components/PaginaLista';
import { ChipsFiltro } from '@/components/ChipsFiltro';
import { Busca } from '@/components/Busca';
import { Dialogo } from '@/components/Dialogo';
import { CadastroEmMassa, type Resultado } from '@/components/CadastroEmMassa';
import { FormUsuario } from './FormUsuario';

const telefones = (p: Pessoa) => [p.telefoneCorp && `Corp. ${p.telefoneCorp}`, p.telefonePart && `Part. ${p.telefonePart}`].filter(Boolean).join(' · ');
const SeloEquip = ({ p }: { p: Pessoa }) =>
  p.equipamentos.length ? <span className="flex flex-wrap gap-1">{p.equipamentos.map((e) => <span key={e.id} className="selo out">Com {e.codigo}</span>)}</span> : null;

function Usuarios() {
  const [f, mudar] = useFiltrosUrl({ q: '', tecnico: '', ativo: '', setorId: '' });
  const [editando, setEditando] = useState<Pessoa | 'novo' | null>(null);
  const [lote, setLote] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const podeEditar = usePode('usuarios'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const { data: setores } = useQuery({ queryKey: ['setores'], queryFn: () => api<{ itens: Setor[] }>('/setores') });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['pessoas'] });
  async function acao(fazer: () => Promise<unknown>, ok: string) {
    try {
      await fazer();
      await recarregar();
      avisar(ok);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível concluir.');
    }
  }
  async function excluir(p: Pessoa) {
    if (!(await perguntar(`Excluir ${p.nome}? O acesso ao sistema também é suspenso. Dá para restaurar depois pela Auditoria.`, 'Excluir', { titulo: 'Excluir', perigo: true }))) return;
    await acao(() => api(`/pessoas/${p.id}`, { metodo: 'DELETE' }), 'Usuário excluído.');
  }
  async function desativarSelecionados() {
    const n = selecionados.size;
    if (!(await perguntar(`Desativar ${n} usuário${n === 1 ? '' : 's'}? Os equipamentos vinculados voltam para o estoque.`, 'Desativar', { perigo: true }))) return;
    await acao(() => api('/pessoas/desativar', { metodo: 'POST', corpo: { ids: [...selecionados] } }), n === 1 ? 'Usuário desativado.' : `${n} usuários desativados.`);
    setSelecionados(new Set());
  }
  const alternar = (id: string, marcado: boolean) => setSelecionados((s) => {
    const n = new Set(s);
    if (marcado) n.add(id); else n.delete(id);
    return n;
  });

  const marcar = (p: Pessoa) => (
    <input type="checkbox" aria-label={`Selecionar ${p.nome}`} checked={selecionados.has(p.id)} onChange={(e) => alternar(p.id, e.target.checked)} />
  );
  const acoes = (p: Pessoa) => (
    <div className="flex gap-3">
      {podeEditar && <button type="button" className="link" onClick={() => setEditando(p)}>Editar</button>}
      {podeEditar && !p.ativo && <button type="button" className="link" onClick={() => acao(() => api(`/pessoas/${p.id}/reativar`, { metodo: 'POST' }), 'Usuário reativado.')}>Reativar</button>}
      {podeExcluir && (
        <button type="button" className="link text-[var(--late)] disabled:opacity-40" disabled={!!p.exclusaoTravada} title={p.exclusaoTravada ?? undefined} onClick={() => excluir(p)}>Excluir</button>
      )}
    </div>
  );
  const nome = (p: Pessoa) => (
    <span className="flex flex-wrap items-center gap-2">
      <b>{p.nome}</b>
      {p.tecnico && <span className="selo ok">Técnico da TI</span>}
      {!p.ativo && <span className="selo late">Desativado</span>}
    </span>
  );
  const colunas: Coluna<Pessoa>[] = [
    ...(podeEditar ? [{ titulo: ' ', celula: marcar }] : []),
    { titulo: 'Nome', celula: nome },
    { titulo: 'E-mail', celula: (p) => p.email },
    { titulo: 'Setor', celula: (p) => p.setor.nome },
    { titulo: 'Telefones', celula: telefones },
    { titulo: 'Equipamentos', celula: (p) => <SeloEquip p={p} /> },
    { titulo: '', celula: acoes },
  ];

  return (
    <>
      <PaginaLista<Pessoa>
        titulo="Usuários" area="pessoas" caminho="/pessoas" filtros={f} auditoriaArea="pessoas"
        colunas={colunas} nomeLinha={(p) => p.nome}
        acoesTopo={podeEditar && (
          <>
            <button type="button" className="btn" onClick={() => setEditando('novo')}>Novo usuário</button>
            <button type="button" className="btn ghost" onClick={() => setLote(true)}>Cadastro em massa</button>
            {selecionados.size > 0 && <button type="button" className="btn perigo" onClick={desativarSelecionados}>Desativar selecionados</button>}
          </>
        )}
        topo={(
          <>
            <Busca valor={f.q} onChange={(q) => mudar({ q })} />
            <ChipsFiltro nome="Perfil" opcoes={[{ valor: 'nao', rotulo: 'Colaborador' }, { valor: 'sim', rotulo: 'Técnico da TI', cls: 'ok' }]} valor={f.tecnico} onChange={(tecnico) => mudar({ tecnico })} />
            <ChipsFiltro nome="Situação" opcoes={[{ valor: 'sim', rotulo: 'Ativos', cls: 'ok' }, { valor: 'nao', rotulo: 'Desativados', cls: 'late' }]} valor={f.ativo} onChange={(ativo) => mudar({ ativo })} />
            {!!setores?.itens.length && (
              <ChipsFiltro nome="Setor" opcoes={setores.itens.map((s) => ({ valor: s.id, rotulo: s.nome }))} valor={f.setorId} onChange={(setorId) => mudar({ setorId })} />
            )}
          </>
        )}
        cartao={(p) => (
          <>
            <div className="flex items-start justify-between gap-2">{nome(p)}{podeEditar && marcar(p)}</div>
            <p className="meta">{[p.email, p.setor.nome].join(' · ')}</p>
            {telefones(p) && <p className="text-sm">{telefones(p)}</p>}
            <div className="mt-1"><SeloEquip p={p} /></div>
            <div className="mt-2">{acoes(p)}</div>
          </>
        )}
      />
      <Dialogo titulo={editando === 'novo' ? 'Novo usuário' : 'Editar usuário'} aberto={!!editando} onFechar={() => setEditando(null)}>
        {editando && <FormUsuario key={editando === 'novo' ? 'novo' : editando.id} pessoa={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Dialogo>
      <Dialogo titulo="Cadastro em massa" aberto={lote} onFechar={() => setLote(false)}>
        <CadastroEmMassa
          colunas={['Nome', 'E-mail', 'Setor', 'Perfil (opcional: tic, master, solicitante, consulta)']}
          exemplo={'Maria Souza\tmaria.souza@suinco.com.br\tTI'}
          montar={([nome, email, setor, perfil]) => ({ nome, email, setor, ...(perfil ? { perfil: perfil.toLowerCase() } : {}) })}
          onEnviar={async (linhas) => {
            const r = await api<Resultado>('/pessoas/lote', { metodo: 'POST', corpo: { linhas } });
            await recarregar();
            return r;
          }}
        />
      </Dialogo>
    </>
  );
}

export default function Pagina() {
  return <Suspense><Usuarios /></Suspense>;
}
