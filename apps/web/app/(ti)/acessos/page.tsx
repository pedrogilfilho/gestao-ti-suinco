'use client';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOMES_PAPEL, PAPEIS } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { useEu } from '@/lib/sessao';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { dataBR } from '@/lib/tipos';
import { Dialogo } from '@/components/Dialogo';
import { MenuAcoes, type ItemMenu } from '@/components/MenuAcoes';
import { FormAcesso } from './FormAcesso';
import { Grupos } from './Grupos';
import type { Acesso } from './tipos';

const CLS_PAPEL = { master: 'sel-master', tic: 'sel-tic', solicitante: 'sel-solic', consulta: 'sel-consulta' } as const;
const SeloPerfil = ({ a }: { a: Acesso }) => <span className={`selo ${a.grupo ? 'sel-outro' : CLS_PAPEL[a.papel]}`}>{a.nomePapel}</span>;
const Status = ({ a }: { a: Acesso }) => (a.suspenso ? <span className="selo late">Suspenso</span>
  : a.aguardandoPrimeiroLogin ? <span className="selo warn">Liberado em {dataBR(a.criadoEm)}</span>
    : <span className="selo ok">Já entrou {dataBR(a.ultimoLoginEm)}</span>);

function SenhaTemporaria({ senha, onFechar }: { senha: string; onFechar: () => void }) {
  const [copiou, setCopiou] = useState(false);
  return (
    <div className="space-y-4">
      <p>Passe esta senha para a pessoa. Ela vai trocar no primeiro login. <b>A senha não aparece de novo.</b></p>
      <p className="card text-center font-mono text-lg">{senha}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={async () => { await navigator.clipboard?.writeText(senha).catch(() => undefined); setCopiou(true); }}>{copiou ? 'Copiada' : 'Copiar'}</button>
        <button type="button" className="btn" onClick={onFechar}>Pronto</button>
      </div>
    </div>
  );
}

function Acessos() {
  const [f, mudar] = useFiltrosUrl({ aba: 'acessos' });
  const [editando, setEditando] = useState<Acesso | 'novo' | null>(null);
  const [senha, setSenha] = useState('');
  const { eu } = useEu();
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const q = useQuery({ queryKey: ['acessos'], queryFn: () => api<{ itens: Acesso[] }>('/acessos') });
  const itens = q.data?.itens ?? [];

  async function acao(a: Acesso, caminho: string, ok: string) {
    try {
      const r = await api<{ senhaTemporaria?: string }>(`/acessos/${a.id}/${caminho}`, { metodo: 'POST' });
      await qc.invalidateQueries({ queryKey: ['acessos'] });
      if (r?.senhaTemporaria) setSenha(r.senhaTemporaria); else avisar(ok);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível concluir.');
    }
  }
  const confirmar = async (a: Acesso, texto: string, botao: string, caminho: string, ok: string, perigo = false) => {
    if (await perguntar(texto, botao, { perigo })) await acao(a, caminho, ok);
  };
  async function remover(a: Acesso) {
    if (!(await perguntar(`Remover o acesso de ${a.pessoa.nome}? A pessoa continua cadastrada em Usuários, só não entra mais no sistema.`, 'Remover acesso', { perigo: true }))) return;
    try {
      await api(`/acessos/${a.id}`, { metodo: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['acessos'] });
      avisar('Acesso removido.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível remover.');
    }
  }
  const menu = (a: Acesso) => {
    if (a.dono && !eu?.dono) return <span className="meta text-sm">Dono do app</span>;
    const itensMenu: ItemMenu[] = [
      { rotulo: 'Editar', acao: () => setEditando(a) },
      { rotulo: 'Redefinir senha', acao: () => confirmar(a, `Gerar uma senha temporária para ${a.pessoa.nome}? A senha atual deixa de valer e a pessoa sai de todos os aparelhos.`, 'Redefinir senha', 'senha-temporaria', '') },
      { rotulo: 'Forçar logout', acao: () => confirmar(a, `Encerrar a sessão de ${a.pessoa.nome} em todos os aparelhos?`, 'Forçar logout', 'forcar-logout', 'Sessão encerrada.') },
      a.suspenso
        ? { rotulo: 'Reativar', acao: () => acao(a, 'reativar', 'Acesso reativado.') }
        : { rotulo: 'Suspender', acao: () => confirmar(a, `Suspender o acesso de ${a.pessoa.nome}? A pessoa sai na hora e não entra até ser reativada.`, 'Suspender', 'suspender', 'Acesso suspenso.', true) },
      { rotulo: 'Ver ações na Auditoria', href: `/auditoria?atorId=${a.id}` },
      { rotulo: 'Remover acesso', acao: () => remover(a), perigo: true },
    ];
    return (
      <span className="flex items-center gap-2">
        {a.dono && <span className="meta text-sm">Dono do app</span>}
        <MenuAcoes itens={itensMenu} />
      </span>
    );
  };
  const resumo = PAPEIS.map((p) => [NOMES_PAPEL[p], itens.filter((a) => a.papel === p).length] as const).filter(([, n]) => n);

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Acessos</h1>
        {f.aba === 'acessos' && <button type="button" className="btn" onClick={() => setEditando('novo')}>Liberar acesso</button>}
      </header>
      <div role="tablist" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={f.aba === 'acessos'} className={`chip ${f.aba === 'acessos' ? 'ativo' : ''}`} onClick={() => mudar({ aba: '' })}>Acessos</button>
        <button type="button" role="tab" aria-selected={f.aba === 'grupos'} className={`chip ${f.aba === 'grupos' ? 'ativo' : ''}`} onClick={() => mudar({ aba: 'grupos' })}>Grupos</button>
      </div>
      {f.aba === 'grupos' ? <Grupos /> : (
        <>
          {!!resumo.length && <p className="meta mb-3">{resumo.map(([n, c]) => `${c} ${n}`).join(' · ')}</p>}
          {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar os acessos.</p>}
          <div className="overflow-x-auto max-md:hidden">
            <table className="tabela">
              <thead><tr><th>Pessoa</th><th>Setor</th><th>Perfil</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {itens.map((a) => (
                  <tr key={a.id} aria-label={`${a.pessoa.nome} ${a.pessoa.email}`}>
                    <td><b>{a.pessoa.nome}</b><span className="meta block">{a.pessoa.email}</span></td>
                    <td>{a.pessoa.setor}</td>
                    <td><SeloPerfil a={a} /></td>
                    <td><Status a={a} /></td>
                    <td>{menu(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {itens.map((a) => (
              <article key={a.id} aria-label={`${a.pessoa.nome} ${a.pessoa.email}`} className="card">
                <div className="flex items-start justify-between gap-2"><b>{a.pessoa.nome}</b>{menu(a)}</div>
                <p className="meta">{a.pessoa.email} · {a.pessoa.setor}</p>
                <div className="mt-1 flex flex-wrap gap-2"><SeloPerfil a={a} /><Status a={a} /></div>
              </article>
            ))}
          </div>
        </>
      )}
      <Dialogo titulo={editando === 'novo' ? 'Liberar acesso' : 'Editar acesso'} aberto={!!editando} onFechar={() => setEditando(null)} largura="max-w-lg">
        {editando && <FormAcesso acesso={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} onSenha={setSenha} />}
      </Dialogo>
      <Dialogo titulo="Senha temporária" aberto={!!senha} onFechar={() => setSenha('')} largura="max-w-md">
        <SenhaTemporaria senha={senha} onFechar={() => setSenha('')} />
      </Dialogo>
    </section>
  );
}

export default function Pagina() {
  return <Suspense><Acessos /></Suspense>;
}
