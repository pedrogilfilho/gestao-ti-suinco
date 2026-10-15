'use client';
import { Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { dataHoraBR, type Config, type Pedido } from '@/lib/tipos';
import { ChipsFiltro, type Opcao } from '@/components/ChipsFiltro';
import { Busca } from '@/components/Busca';
import { Dialogo } from '@/components/Dialogo';
import { Conversa } from '@/components/Conversa';
import { FormEmprestimo, type PresetEmprestimo } from '../em-uso/FormEmprestimo';
import { Aprovar } from './Aprovar';
import { Recusar } from './Recusar';

const MOSTRAR: Opcao[] = [
  { valor: 'pendentes', rotulo: 'Pendentes', cls: 'warn' }, { valor: 'urgentes', rotulo: 'Urgentes', cls: 'late' },
  { valor: 'semequip', rotulo: 'Sem equipamento', cls: 'late' }, { valor: 'aprovados', rotulo: 'Aprovados', cls: 'ok' },
  { valor: 'entregues', rotulo: 'Entregues', cls: 'ok' }, { valor: 'recusados', rotulo: 'Recusados', cls: 'late' },
  { valor: 'cancelados', rotulo: 'Cancelados' }, { valor: 'todos', rotulo: 'Todos' },
];
const SITUACAO: Record<Pedido['status'], [string, string]> = {
  pendente: ['warn', 'Pendente'], aprovado: ['ok', 'Aprovado · reservado'], entregue: ['ok', 'Entregue'], recusado: ['late', 'Recusado'], cancelado: ['late', 'Cancelado pelo colaborador'],
};
const finalidade = (p: Pedido) => (p.urgente ? 'Urgência' : p.finalidade === 'Outra' && p.finalidadeOutra ? `Outra: ${p.finalidadeOutra}` : p.finalidade);
const urgentePendente = (p: Pedido) => p.urgente && p.status === 'pendente';
const loteOk = (p: Pedido) => p.status === 'pendente' && !p.urgente;
const lerKanban = () => { try { return localStorage.getItem('pedKanban') === '1'; } catch { return false; } };

type Aberto = { tipo: 'aprovar' | 'recusar'; p: Pedido } | { tipo: 'emprestimo'; preset: PresetEmprestimo; titulo: string } | null;
type ResultadoLote = { aprovados: { id: string; nome: string; equipamento: string }[]; pendentes: { id: string; nome: string; motivo: string }[] };

function ChamadoPedido({ p }: { p: Pedido }) {
  const [v, setV] = useState(p.chamadoGlpi);
  const qc = useQueryClient();
  const avisar = useAviso();
  useEffect(() => setV(p.chamadoGlpi), [p.chamadoGlpi]);
  async function salvar() {
    if (!v) return avisar('Informe o nº do chamado.');
    try {
      await api(`/pedidos/${p.id}/chamado`, { metodo: 'PATCH', corpo: { chamadoGlpi: v } });
      await qc.invalidateQueries({ queryKey: ['pedidos'] });
      avisar('Chamado atualizado.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível salvar o chamado.');
    }
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-sm">
      <label htmlFor={`ch-${p.id}`} className="meta whitespace-nowrap">Chamado GLPI</label>
      <input id={`ch-${p.id}`} className="campo max-w-40 py-1" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }} />
      <button type="button" className="btn ghost py-1" onClick={salvar}>Salvar</button>
    </div>
  );
}

function Pedidos() {
  const [f, mudar] = useFiltrosUrl({ q: '', status: 'pendentes' });
  const [kanban, setKanban] = useState(false);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<ResultadoLote | null>(null);
  const podeReservar = usePode('reservar'), podeEmprestar = usePode('emprestar'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  useEffect(() => setKanban(lerKanban()), []);
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') });
  const qs = new URLSearchParams({ status: kanban ? 'todos' : f.status, limite: '200', ...(f.q && { q: f.q }) }).toString();
  const q = useQuery({ queryKey: ['pedidos', 'lista', qs], queryFn: () => api<{ itens: Pedido[] }>(`/pedidos?${qs}`) });
  const itens = q.data?.itens ?? [];
  const fechar = () => setAberto(null);
  const recarregar = () => Promise.all(['pedidos', 'reservas', 'contadores', 'alertas'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  function alternarKanban() {
    const n = !kanban;
    setKanban(n);
    try { localStorage.setItem('pedKanban', n ? '1' : '0'); } catch { /* sem armazenamento */ }
  }
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  async function aprovarLote() {
    const ids = [...sel].filter((id) => itens.some((p) => p.id === id && loteOk(p)));
    if (!ids.length) return avisar('Nenhum pedido pendente selecionado.');
    const n = ids.length;
    if (!(await perguntar(`Aprovar e reservar ${n} pedido${n === 1 ? '' : 's'} de uma vez?\n\nO sistema escolhe um equipamento livre para cada um. Pedidos sem equipamento livre, com atraso ou acima do limite ficam pendentes para você ver um a um.`, 'Aprovar selecionados'))) return;
    try {
      setLote(await api<ResultadoLote>('/pedidos/aprovar-lote', { metodo: 'POST', corpo: { ids } }));
      setSel(new Set());
      await recarregar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível aprovar.');
    }
  }
  async function avisarSemEquip(p: Pedido) {
    try {
      await api(`/pedidos/${p.id}/avisar-sem-equipamento`, { metodo: 'POST' });
      await recarregar();
      avisar('Mensagem enviada ao colaborador no chat do pedido.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível enviar a mensagem.');
    }
  }
  async function excluir(p: Pedido) {
    if (!(await perguntar(`Excluir o pedido de ${p.pessoa.nome}? Dá para restaurar depois pela Auditoria.`, 'Excluir', { perigo: true }))) return;
    try {
      await api(`/pedidos/${p.id}`, { metodo: 'DELETE' });
      await recarregar();
      avisar('Pedido excluído.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível excluir.');
    }
  }
  const retirar = (p: Pedido) => p.equipamento && setAberto({
    tipo: 'emprestimo', titulo: `Registrar retirada de ${p.equipamento.codigo}`,
    preset: {
      equipamento: p.equipamento, pessoa: { id: p.pessoa.id, nome: p.pessoa.nome, email: p.pessoa.email }, finalidade: p.urgente ? undefined : p.finalidade,
      finalidadeOutra: p.finalidadeOutra, chamadoGlpi: p.chamadoGlpi, obs: p.obs, previsaoEm: p.devolucaoEm, acessorios: p.acessorios, reservaId: p.reserva!.id,
    },
  });

  const botoes = (p: Pedido) => (
    <>
      {p.status === 'pendente' && podeReservar && (
        <>
          <button type="button" className={`btn ${p.urgente ? 'perigo' : ''}`} onClick={() => setAberto({ tipo: 'aprovar', p })}>{p.urgente ? 'Avaliar e aprovar' : 'Aprovar e reservar'}</button>
          <button type="button" className="btn ghost" onClick={() => setAberto({ tipo: 'recusar', p })}>Recusar</button>
        </>
      )}
      {p.status === 'aprovado' && p.reserva?.status === 'ativa' && podeEmprestar && <button type="button" className="btn" onClick={() => retirar(p)}>Registrar retirada</button>}
      {podeExcluir && <button type="button" className="btn ghost" onClick={() => excluir(p)}>Excluir</button>}
    </>
  );

  const cartao = (p: Pedido) => {
    const [cls, txt] = SITUACAO[p.status];
    return (
      <article key={p.id} aria-label={`Pedido de ${p.pessoa.nome}`} className={`card ${urgentePendente(p) ? 'border-[var(--late)]' : p.status === 'pendente' ? 'border-[var(--warn)]' : ''}`}>
        {loteOk(p) && podeReservar && (
          <label className="meta mb-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sel.has(p.id)} onChange={(e) => marcar(p.id, e.target.checked)} /> Selecionar para aprovar em lote
          </label>
        )}
        <p className="meta text-sm">
          {urgentePendente(p) && <span className="selo late mr-1">EXTREMA URGÊNCIA</span>}
          {p.tipo} · pedido em {dataHoraBR(p.criadoEm)}{p.editadoEm ? ` · editado ${dataHoraBR(p.editadoEm)}` : ''}
          {p.ultimaDe === 'colab' && <span className="selo out ml-1">Nova mensagem</span>}
        </p>
        {p.urgente && p.justificativa && <p className="text-sm text-[var(--late)]"><b>Motivo da urgência:</b> {p.justificativa}</p>}
        <p><b>{p.pessoa.nome}</b> <span className="meta text-sm">{p.pessoa.email}</span></p>
        {p.status === 'pendente' && p.atrasos > 0 && <p className="text-sm text-[var(--late)]"><b>Atenção:</b> esta pessoa está com {p.atrasos} equipamento(s) em atraso. Novas reservas ficam bloqueadas.</p>}
        <p className="text-sm">
          {p.urgente && !p.devolucaoEm ? `Pedido às ${dataHoraBR(p.retiradaEm)} · horários a definir na aprovação` : `Retirada ${dataHoraBR(p.retiradaEm)} · devolução ${dataHoraBR(p.devolucaoEm)}`}
        </p>
        <p className="meta text-sm">Finalidade: {finalidade(p)}{p.acessorios.length ? ` · Acessórios: ${p.acessorios.join(', ')}` : ''}</p>
        <p className="meta text-sm">Contato: {[p.telefoneCorp, p.telefonePart].filter(Boolean).join(' · ') || 'não informado'}</p>
        {!p.temAssinatura && config?.assinaturas && <p className="text-sm text-[var(--warn)]">Sem assinatura do colaborador</p>}
        {p.status !== 'cancelado' && podeReservar ? <ChamadoPedido p={p} /> : <p className="meta text-sm">Chamado GLPI {p.chamadoGlpi}</p>}
        {p.status !== 'cancelado' && podeReservar && <p className="sr-only">Chamado GLPI {p.chamadoGlpi}</p>}
        {p.obs && <p className="meta text-sm">{p.obs}</p>}
        {p.semEquipamento && (
          <p className="my-1 text-sm">
            <span className="selo late">Todos os equipamentos já estão agendados nesse período</span>
            {p.semEquipAvisadoEm ? <small className="meta"> · colaborador avisado {dataHoraBR(p.semEquipAvisadoEm)}</small>
              : podeReservar && <button type="button" className="link ml-2" onClick={() => avisarSemEquip(p)}>Avisar colaborador</button>}
          </p>
        )}
        {(p.status === 'aprovado' || p.status === 'entregue') && <p className="meta text-sm">{p.status === 'entregue' ? 'Entregue' : 'Reservado'}: {p.equipamento?.codigo}</p>}
        {p.status === 'recusado' && p.motivoRecusa && <p className="meta text-sm">Motivo: {p.motivoRecusa}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`selo ${cls}`}>{txt}</span>{botoes(p)}</div>
        <details className="mt-2" open={p.ultimaDe === 'colab'}>
          <summary className="link text-sm">Conversa</summary>
          <Conversa pedidoId={p.id} lado="ti" nomeColab={p.pessoa.nome} fechado={p.status === 'cancelado' || !(podeReservar || podeEmprestar)} />
        </details>
      </article>
    );
  };

  // agrupado por setor; urgentes pendentes primeiro dentro de cada setor
  const grupos = new Map<string, Pedido[]>();
  for (const p of itens) { const k = p.pessoa.setor || 'Sem setor'; grupos.set(k, [...(grupos.get(k) ?? []), p]); }
  const setores = [...grupos.keys()].sort((a, b) => (a === 'Sem setor' ? 1 : b === 'Sem setor' ? -1 : a.localeCompare(b, 'pt-BR')));
  const selecionaveis = itens.filter(loteOk);

  const coluna = (titulo: string, cls: string, l: Pedido[], vazio: string) => (
    <div className="min-w-64 flex-1 space-y-2">
      <h2 className="flex items-center justify-between font-semibold">{titulo}<span className={`selo ${cls}`}>{l.length}</span></h2>
      {l.length ? l.map((p) => (
        <div key={p.id} className={`card text-sm ${urgentePendente(p) ? 'border-[var(--late)]' : ''}`}>
          {urgentePendente(p) && <span className="selo late">URGENTE</span>} <b>{p.pessoa.nome}</b>
          <p className="meta">{p.tipo}{p.equipamento ? ` · ${p.equipamento.codigo}` : ''} · {p.pessoa.setor}</p>
          <p className="meta">Retirada {dataHoraBR(p.retiradaEm)}{p.devolucaoEm ? ` · devolução ${dataHoraBR(p.devolucaoEm)}` : ''}</p>
          {p.semEquipamento && <p className="font-semibold text-[var(--late)]">Todos os equipamentos agendados nesse período</p>}
          {p.ultimaDe === 'colab' && <span className="selo out">Nova mensagem</span>}
          <div className="mt-1 flex flex-wrap gap-2">{botoes(p)}</div>
        </div>
      )) : <p className="meta p-2">{vazio}</p>}
    </div>
  );

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Pedidos</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn ghost" onClick={alternarKanban}>{kanban ? 'Ver em lista' : 'Ver em quadro (Kanban)'}</button>
          <Link className="btn ghost" href="/auditoria?area=pedidos">Auditoria</Link>
        </div>
      </header>
      <div className="mb-4 space-y-3">
        <Busca valor={f.q} onChange={(v) => mudar({ q: v })} />
        {!kanban && <ChipsFiltro nome="Mostrar" opcoes={MOSTRAR} valor={f.status} onChange={(status) => mudar({ status })} />}
        {!kanban && podeReservar && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!selecionaveis.length} checked={!!selecionaveis.length && selecionaveis.every((p) => sel.has(p.id))}
                onChange={(e) => setSel(e.target.checked ? new Set(selecionaveis.map((p) => p.id)) : new Set())} /> Selecionar todos
            </label>
            <button type="button" className="btn" disabled={!sel.size} onClick={aprovarLote}>{sel.size ? `Aprovar selecionados (${sel.size})` : 'Aprovar selecionados'}</button>
          </div>
        )}
      </div>
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar os pedidos.</p>}
      {q.isLoading && <p className="meta">Carregando...</p>}
      {kanban ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {coluna('Aguardando análise', 'warn', itens.filter((p) => p.status === 'pendente').sort((a, b) => Number(b.urgente) - Number(a.urgente)), 'Nenhum pedido aguardando.')}
          {coluna('Aprovados / em separação', 'out', itens.filter((p) => p.status === 'aprovado'), 'Nenhum pedido aprovado aguardando retirada.')}
          {coluna('Entregues / concluídos', 'ok', itens.filter((p) => p.status === 'entregue').slice(0, 30), 'Nenhuma entrega ainda.')}
        </div>
      ) : (
        <>
          {!q.isLoading && !itens.length && <p className="meta">{f.status === 'todos' ? 'Nenhum pedido ainda.' : 'Nenhum pedido nesta situação.'}</p>}
          {setores.map((s) => {
            const l = grupos.get(s)!, np = l.filter((p) => p.status === 'pendente').length, nu = l.filter(urgentePendente).length;
            return (
              <div key={s} className="mb-6">
                <h2 className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
                  {s}<span className="meta text-sm font-normal">{l.length} pedido{l.length === 1 ? '' : 's'}{np ? ` · ${np} pendente${np === 1 ? '' : 's'}` : ''}</span>
                  {nu > 0 && <span className="selo late">{nu} urgente{nu === 1 ? '' : 's'}</span>}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">{l.map(cartao)}</div>
              </div>
            );
          })}
        </>
      )}

      <Dialogo titulo={aberto?.tipo === 'aprovar' ? 'Aprovar pedido' : aberto?.tipo === 'recusar' ? 'Recusar pedido' : aberto?.tipo === 'emprestimo' ? aberto.titulo : ''} aberto={!!aberto} onFechar={fechar}>
        {aberto?.tipo === 'aprovar' && <Aprovar pedido={aberto.p} onFechar={fechar} onEntregar={(preset) => setAberto({ tipo: 'emprestimo', preset, titulo: `Entregar ${preset.equipamento.codigo} agora` })} />}
        {aberto?.tipo === 'recusar' && <Recusar pedido={aberto.p} onFechar={fechar} />}
        {aberto?.tipo === 'emprestimo' && config && <FormEmprestimo config={config} preset={aberto.preset} onFechar={() => { fechar(); void recarregar(); }} />}
      </Dialogo>
      <Dialogo titulo="Aprovação em lote" aberto={!!lote} onFechar={() => setLote(null)} largura="max-w-md">
        {lote && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{lote.aprovados.length} pedido{lote.aprovados.length === 1 ? '' : 's'} aprovado{lote.aprovados.length === 1 ? '' : 's'}{lote.aprovados.length ? ':' : '.'}</p>
            <ul className="list-disc pl-5">{lote.aprovados.map((a) => <li key={a.id}>{a.nome} → {a.equipamento}</li>)}</ul>
            {lote.pendentes.length > 0 && (
              <>
                <p className="font-semibold">Ficaram pendentes ({lote.pendentes.length}):</p>
                <ul className="list-disc pl-5">{lote.pendentes.map((x) => <li key={x.id}>{x.motivo}</li>)}</ul>
              </>
            )}
            <div className="flex justify-end"><button type="button" className="btn" onClick={() => setLote(null)}>Fechar</button></div>
          </div>
        )}
      </Dialogo>
    </section>
  );
}

export default function Pagina() {
  return <Suspense><Pedidos /></Suspense>;
}
