'use client';
import { Suspense } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { dataHoraBR } from '@/lib/tipos';
import { ChipsFiltro, type Opcao } from '@/components/ChipsFiltro';
import { Campo } from '@/components/Campo';

type Registro = {
  id: string; em: string; acao: string; area: string; itemId: string | null; atorId: string | null;
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
  ator: { nome: string; email: string } | null; restauravel: boolean;
};

const AREAS: Opcao[] = [
  { valor: 'emprestimos', rotulo: 'Empréstimos' }, { valor: 'pedidos', rotulo: 'Pedidos' }, { valor: 'reservas', rotulo: 'Reservas' }, { valor: 'equipamentos', rotulo: 'Equipamentos' }, { valor: 'pessoas', rotulo: 'Usuários' },
  { valor: 'setores', rotulo: 'Setores' }, { valor: 'acessos', rotulo: 'Acessos' }, { valor: 'grupos', rotulo: 'Grupos' },
  { valor: 'config', rotulo: 'Configurações' }, { valor: 'auth', rotulo: 'Login' },
];
const NOME_AREA = Object.fromEntries(AREAS.map((a) => [a.valor, a.rotulo]));
const ACOES: Record<string, { txt: string; cls: string }> = {
  criar: { txt: 'Criou', cls: 'ok' }, editar: { txt: 'Alterou', cls: 'info' }, excluir: { txt: 'Excluiu', cls: 'late' },
  restaurar: { txt: 'Restaurou', cls: 'ok' }, cancelar: { txt: 'Cancelou', cls: 'late' }, aprovar: { txt: 'Aprovou', cls: 'ok' }, recusar: { txt: 'Recusou', cls: 'late' }, devolver: { txt: 'Devolveu', cls: 'ok' }, resolver: { txt: 'Resolveu pendência', cls: 'ok' },
  senha: { txt: 'Redefiniu a senha', cls: 'warn' }, forcar_logout: { txt: 'Forçou logout', cls: 'warn' }, login: { txt: 'Entrou', cls: 'info' },
  ativo: { txt: 'Voltou a ativo', cls: 'ok' }, manutencao: { txt: 'Mandou para manutenção', cls: 'warn' }, danificado: { txt: 'Marcou danificado', cls: 'late' },
  extraviado: { txt: 'Marcou extraviado', cls: 'late' }, baixado: { txt: 'Deu baixa', cls: 'late' },
};
const ROTULOS: Record<string, string> = {
  nome: 'Nome', codigo: 'Nome', email: 'E-mail', tipo: 'Tipo', modelo: 'Modelo', patrimonio: 'Patrimônio', serie: 'Série', situacao: 'Situação',
  setorId: 'Setor', pessoaId: 'Vinculado a', vinculoLivre: 'Vinculado a (texto)', telefoneCorp: 'Telefone corporativo', telefonePart: 'Telefone particular',
  login: 'Login', ativo: 'Ativo', limites: 'Limites de empréstimo', previsaoEm: 'Previsão', retiradaEm: 'Retirada', devolvidoEm: 'Devolvido em',
  finalidade: 'Finalidade', acessorios: 'Acessórios', acessoriosFaltando: 'Acessórios faltando', chamadoGlpi: 'Chamado GLPI', obs: 'Observações',
  papel: 'Perfil', permissoes: 'Permissões', suspenso: 'Suspenso', grupoId: 'Grupo', ip: 'IP', mac: 'MAC', termoStatus: 'Termo',
  equipamentosSoltos: 'Equipamentos soltos', inicioEm: 'Início', fimEm: 'Fim', status: 'Situação do registro', motivoRecusa: 'Motivo da recusa',
  justificativa: 'Justificativa', devolucaoEm: 'Devolução', mensagemTi: 'Mensagem da TI', liberouLimite: 'Liberou exceção de limite', confirmouAtraso: 'Entregou com atraso',
};
const IGNORAR = new Set(['id', 'criadoEm', 'atualizadoEm', 'excluidoEm', 'vinculadoEm', 'assinaturaUrl', 'fotoUrl', 'assinaturaRetiradaUrl', 'assinaturaDevolucaoUrl']);
const ISO = /^\d{4}-\d{2}-\d{2}T/;

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'string') return ISO.test(v) ? dataHoraBR(v) : v;
  if (typeof v === 'object') return Object.entries(v).filter(([, x]) => x !== false).map(([k, x]) => (x === true ? k : `${k}: ${x}`)).join(', ') || '—';
  return String(v);
}
const nomeItem = (r: Registro) => {
  const o = { ...(r.antes ?? {}), ...(r.depois ?? {}) };
  return [o.codigo, o.equipamento, o.nome, o.pessoa, o.email].find((x) => typeof x === 'string' && x) as string | undefined;
};
// só os campos que mudaram (na criação/exclusão, nada: o nome do item basta)
function diferencas(r: Registro) {
  if (!r.antes || !r.depois) return [];
  return [...new Set([...Object.keys(r.antes), ...Object.keys(r.depois)])]
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(r.antes![k]) !== JSON.stringify(r.depois![k]) && k in r.depois!)
    .map((k) => ({ k, rotulo: ROTULOS[k] ?? k, de: valor(r.antes![k]), para: valor(r.depois![k]) }));
}

function Auditoria() {
  const [f, mudar] = useFiltrosUrl({ area: '', acao: '', atorId: '', itemId: '', de: '', ate: '' });
  const podeRestaurar = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useInfiniteQuery({
    queryKey: ['auditoria', f],
    queryFn: ({ pageParam }) => api<{ itens: Registro[]; proximo: string | null }>(`/auditoria?${qs}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '', getNextPageParam: (u) => u.proximo ?? undefined,
  });
  const itens = q.data?.pages.flatMap((p) => p.itens) ?? [];

  async function restaurar(r: Registro) {
    const oque = r.acao === 'excluir' ? `Restaurar ${nomeItem(r) ?? 'o cadastro'} excluído?` : `Desfazer esta alteração em ${nomeItem(r) ?? 'o cadastro'}?`;
    if (!(await perguntar(oque, 'Restaurar'))) return;
    try {
      await api(`/auditoria/${r.id}/restaurar`, { metodo: 'POST' });
      await Promise.all(['auditoria', r.area].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Restaurado.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível restaurar.');
    }
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Auditoria</h1>
      <div className="mb-4 space-y-3">
        <ChipsFiltro nome="Área" opcoes={AREAS} valor={f.area} onChange={(area) => mudar({ area })} />
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Ação">
            <select className="campo" value={f.acao} onChange={(e) => mudar({ acao: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ACOES).map(([k, a]) => <option key={k} value={k}>{a.txt}</option>)}
            </select>
          </Campo>
          <Campo rotulo="De"><input type="date" className="campo" value={f.de} onChange={(e) => mudar({ de: e.target.value })} /></Campo>
          <Campo rotulo="Até"><input type="date" className="campo" value={f.ate} onChange={(e) => mudar({ ate: e.target.value })} /></Campo>
          {(f.atorId || f.itemId) && <button type="button" className="btn ghost" onClick={() => mudar({ atorId: '', itemId: '' })}>Ver de todos</button>}
        </div>
      </div>
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar a auditoria.</p>}
      <div className="grid gap-3">
        {itens.map((r) => {
          const a = ACOES[r.acao] ?? { txt: r.acao, cls: '' };
          const difs = diferencas(r);
          return (
            <article key={r.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`selo ${a.cls}`}>{a.txt}</span>
                <span className="meta">{NOME_AREA[r.area] ?? r.area}</span>
                <b>{nomeItem(r)}</b>
                <span className="flex-1" />
                {podeRestaurar && r.restauravel && <button type="button" className="link" onClick={() => restaurar(r)}>Restaurar</button>}
              </div>
              <p className="meta text-sm">{r.ator?.nome ?? 'Sistema'} · {dataHoraBR(r.em)}</p>
              {difs.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm">
                  {difs.map((d) => <li key={d.k}><span className="meta">{d.rotulo}:</span> <s className="opacity-70">{d.de}</s> → {d.para}</li>)}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      {q.isLoading && <p className="meta mt-4">Carregando...</p>}
      {!q.isLoading && !itens.length && <p className="meta mt-4">Nenhum registro.</p>}
      {q.hasNextPage && <button type="button" className="btn ghost mt-4" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Carregar mais</button>}
    </section>
  );
}

export default function Pagina() {
  return <Suspense><Auditoria /></Suspense>;
}
