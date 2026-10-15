'use client';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { dataHoraBR } from '@/lib/tipos';
import { Conversa } from '@/components/Conversa';

export type MeuPedido = {
  id: string; tipo: string; urgente: boolean; justificativa: string; finalidade: string; finalidadeOutra: string; chamadoGlpi: string;
  retiradaEm: string; devolucaoEm: string | null; acessorios: string[]; obs: string; telefoneCorp: string | null; telefonePart: string | null;
  status: 'pendente' | 'aprovado' | 'recusado' | 'cancelado' | 'entregue'; motivoRecusa: string; mensagemTi: string; editadoEm: string | null;
  ultimaDe: 'colab' | 'ti' | 'sistema' | null; criadoEm: string; temAssinatura: boolean;
  equipamento: { codigo: string } | null; pessoa: { nome: string };
};

const SITUACAO: Record<MeuPedido['status'], [string, string]> = {
  pendente: ['warn', 'Aguardando a TI'], aprovado: ['ok', 'Aprovado'], entregue: ['ok', 'Entregue'], recusado: ['late', 'Recusado'], cancelado: ['late', 'Cancelado'],
};
const finalidade = (p: MeuPedido) => (p.urgente ? 'Urgência' : p.finalidade === 'Outra' && p.finalidadeOutra ? `Outra: ${p.finalidadeOutra}` : p.finalidade);

export function MinhasSolicitacoes({ itens, onEditar }: { itens: MeuPedido[]; onEditar: (p: MeuPedido) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  async function cancelar(p: MeuPedido) {
    if (!(await perguntar('Cancelar esta solicitação?', 'Cancelar pedido'))) return;
    try {
      await api(`/pedidos/${p.id}/cancelar`, { metodo: 'POST' });
      await qc.invalidateQueries({ queryKey: ['pedidos'] });
      avisar('Solicitação cancelada.');
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível cancelar.');
    }
  }
  if (!itens.length) return <p className="meta">Você ainda não fez nenhuma solicitação.</p>;
  return (
    <div className="grid gap-3">
      {itens.map((p) => {
        const [cls, txt] = SITUACAO[p.status];
        return (
          <article key={p.id} aria-label={`Pedido de ${p.tipo} em ${dataHoraBR(p.criadoEm)}`} className="card">
            <div className="flex flex-wrap items-center gap-2">
              {p.urgente && <span className="selo late">URGENTE</span>}
              <span className={`selo ${cls}`}>{txt}</span>
              <b>{p.tipo}</b>
              {p.ultimaDe === 'ti' && <span className="selo out">Resposta da TI</span>}
              <span className="meta">· {finalidade(p)}{p.chamadoGlpi ? ` · Chamado ${p.chamadoGlpi}` : ''}</span>
            </div>
            {p.urgente && <p className="text-sm">Motivo: {p.justificativa}</p>}
            <p className="meta text-sm">
              {p.urgente && p.status === 'pendente' ? 'Horários serão definidos por quem aprovar.'
                : `Retirada ${dataHoraBR(p.retiradaEm)}${p.devolucaoEm ? ` · devolução ${dataHoraBR(p.devolucaoEm)}` : ''}`}
            </p>
            {p.status === 'aprovado' && <p className="text-sm">Equipamento separado: <b>{p.equipamento?.codigo}</b>. Retire na sala da TI em {dataHoraBR(p.retiradaEm)}.</p>}
            {p.status === 'entregue' && <p className="text-sm">Você retirou o <b>{p.equipamento?.codigo}</b>.{p.devolucaoEm ? ` Devolva até ${dataHoraBR(p.devolucaoEm)}.` : ''}</p>}
            {p.mensagemTi && <p className="meta text-sm">Mensagem da TI: {p.mensagemTi}</p>}
            {p.status === 'recusado' && p.motivoRecusa && <p className="text-sm">Motivo: {p.motivoRecusa}</p>}
            {p.editadoEm && <p className="meta text-xs">Editado em {dataHoraBR(p.editadoEm)}</p>}
            {p.status === 'pendente' && (
              <div className="mt-1 flex gap-4">
                <button type="button" className="link" onClick={() => onEditar(p)}>Editar pedido</button>
                <button type="button" className="link" onClick={() => cancelar(p)}>Cancelar pedido</button>
              </div>
            )}
            <Conversa pedidoId={p.id} lado="colab" nomeColab={p.pessoa.nome} fechado={p.status === 'cancelado'} />
          </article>
        );
      })}
    </div>
  );
}
