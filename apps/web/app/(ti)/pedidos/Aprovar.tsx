'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { dataHoraBR, type Pedido } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { SeletorEquipamento, type Ocupacao } from '@/components/SeletorEquipamento';
import { paraCampo, deCampo } from '../em-uso/datas';
import type { PresetEmprestimo } from '../em-uso/FormEmprestimo';

// Mudança de telefone que o colaborador informou no pedido (para "Atualizar no cadastro")
export function telefonesNovos(p: Pedido) {
  const partes: string[] = [];
  if (p.telefoneCorp && p.telefoneCorp !== p.pessoa.telefoneCorp) partes.push(p.pessoa.telefoneCorp ? `corporativo de ${p.pessoa.telefoneCorp} para ${p.telefoneCorp}` : `corporativo ${p.telefoneCorp}`);
  if (p.telefonePart && p.telefonePart !== p.pessoa.telefonePart) partes.push(p.pessoa.telefonePart ? `particular de ${p.pessoa.telefonePart} para ${p.telefonePart}` : `particular ${p.telefonePart}`);
  return partes.join('; ');
}

export function ResumoPedido({ p }: { p: Pedido }) {
  return (
    <div className="card mb-3 text-sm">
      {p.urgente && <p className="font-semibold text-[var(--late)]"><span className="selo late">EXTREMA URGÊNCIA</span> Motivo: {p.justificativa}</p>}
      <p><b>{p.pessoa.nome}</b> <span className="meta">{p.pessoa.email} · {p.pessoa.setor}</span></p>
      <p>{p.tipo} · {p.urgente ? 'Urgência' : p.finalidade === 'Outra' ? `Outra: ${p.finalidadeOutra}` : p.finalidade}{p.chamadoGlpi ? ` · Chamado GLPI: ${p.chamadoGlpi}` : ''}</p>
      {!p.urgente && <p>Retirada {dataHoraBR(p.retiradaEm)} · devolução {dataHoraBR(p.devolucaoEm)}</p>}
      {p.acessorios.length > 0 && <p>Acessórios: {p.acessorios.join(', ')}</p>}
      {p.obs && <p>Obs.: {p.obs}</p>}
      <p>Assinatura do colaborador: {p.temAssinatura ? <b>colhida no pedido</b> : 'não colhida'}</p>
      {(p.telefoneCorp || p.telefonePart) && <p>{[p.telefoneCorp && `Corporativo: ${p.telefoneCorp}`, p.telefonePart && `Particular: ${p.telefonePart}`].filter(Boolean).join(' · ')}</p>}
    </div>
  );
}

export function Aprovar({ pedido: p, onFechar, onEntregar }: { pedido: Pedido; onFechar: () => void; onEntregar: (preset: PresetEmprestimo) => void }) {
  const agora = new Date();
  const [retirada, setRetirada] = useState(paraCampo(p.urgente ? agora : new Date(p.retiradaEm)));
  const [devolucao, setDevolucao] = useState(p.devolucaoEm ? paraCampo(new Date(p.devolucaoEm)) : paraCampo(new Date(agora.getTime() + 2 * 3_600_000)));
  const [equipamentoId, setEquipamentoId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const tels = telefonesNovos(p);
  const [atualizarTelefone, setAtualizarTelefone] = useState(!!tels);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const ehMaster = usePode('excluir'), podeEmprestar = usePode('emprestar');
  const ini = retirada ? deCampo(retirada) : null, fim = devolucao ? deCampo(devolucao) : null;
  const cache = qc.getQueryData<Ocupacao[]>(['equipamentos', 'ocupacao', ini?.toISOString(), fim?.toISOString(), undefined]);
  const escolhido = cache?.find((x) => x.id === equipamentoId);

  async function aprovar(extra: { liberarAtraso?: boolean; liberarLimite?: boolean } = {}): Promise<void> {
    if (!ini || !fim || fim <= ini) return setErros({ devolucaoEm: 'A devolução precisa ser depois da retirada.' });
    try {
      const r = await api<{ equipamento: string }>(`/pedidos/${p.id}/aprovar`, {
        metodo: 'POST', corpo: { equipamentoId, retiradaEm: ini.toISOString(), devolucaoEm: fim.toISOString(), mensagem, atualizarTelefone, ...extra },
      });
      await Promise.all(['pedidos', 'reservas', 'contadores', 'alertas'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar(`Pedido aprovado. ${r.equipamento} reservado para ${dataHoraBR(ini.toISOString())}.`);
      onFechar();
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e;
      if ((e.codigo === 'atraso' || e.codigo === 'limite') && ehMaster) {
        const atraso = e.codigo === 'atraso';
        if (await perguntar(`${e.mensagem}\n\nComo Administrador Master, você pode liberar esta exceção.`, atraso ? 'Liberar mesmo assim' : 'Liberar exceção'))
          return aprovar({ ...extra, [atraso ? 'liberarAtraso' : 'liberarLimite']: true });
        return;
      }
      setErros({ [e.campo ?? '_']: e.mensagem });
    }
  }
  async function clicarAprovar() {
    setErros({}); setSalvando(true);
    try { await aprovar(); } finally { setSalvando(false); }
  }
  function entregar() {
    if (!escolhido) return setErros({ equipamentoId: 'Escolha o equipamento.' });
    onEntregar({
      equipamento: { id: escolhido.id, codigo: escolhido.codigo, tipo: escolhido.tipo }, pessoa: { id: p.pessoa.id, nome: p.pessoa.nome, email: p.pessoa.email },
      finalidade: p.urgente ? undefined : p.finalidade, finalidadeOutra: p.finalidadeOutra, chamadoGlpi: p.chamadoGlpi, obs: [p.obs, mensagem].filter(Boolean).join(' | '),
      previsaoEm: fim?.toISOString() ?? null, acessorios: p.acessorios, pedidoId: p.id, temAssinatura: p.temAssinatura,
    });
  }

  return (
    <div className="space-y-3">
      <ResumoPedido p={p} />
      {p.atrasos > 0 && <p className="text-sm text-[var(--late)]"><b>Atenção:</b> esta pessoa está com {p.atrasos} equipamento(s) em atraso.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Retirada" erro={erros.retiradaEm}><input type="datetime-local" className="campo" value={retirada} onChange={(e) => setRetirada(e.target.value)} /></Campo>
        <Campo rotulo="Devolução" erro={erros.devolucaoEm}><input type="datetime-local" className="campo" value={devolucao} onChange={(e) => setDevolucao(e.target.value)} /></Campo>
      </div>
      <SeletorEquipamento inicio={ini} fim={fim} valor={equipamentoId} onChange={setEquipamentoId} tipoPreferido={p.tipo} erro={erros.equipamentoId} />
      <Campo rotulo="Mensagem para o colaborador (opcional)"><input className="campo" value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: retire na sala da TI" /></Campo>
      {tels && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={atualizarTelefone} onChange={(e) => setAtualizarTelefone(e.target.checked)} /> Atualizar no cadastro de {p.pessoa.nome}: {tels}
        </label>
      )}
      {erros._ && <p role="alert" className="whitespace-pre-line text-[var(--late)]">{erros._}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        {podeEmprestar && <button type="button" className="btn ghost" disabled={!equipamentoId} onClick={entregar}>Entregar agora</button>}
        <button type="button" className={`btn ${p.urgente ? 'perigo' : ''}`} disabled={salvando || !equipamentoId} onClick={clicarAprovar}>Aprovar e reservar</button>
      </div>
    </div>
  );
}
