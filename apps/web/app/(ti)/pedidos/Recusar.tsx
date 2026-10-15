'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MOTIVOS_RECUSA } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import type { Pedido } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { ResumoPedido } from './Aprovar';

export function Recusar({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();

  async function recusar() {
    if (!motivo) return setErro('Escolha o motivo da recusa.');
    if (motivo === 'Outro' && !detalhe.trim()) return setErro('Descreva o motivo.');
    try {
      await api(`/pedidos/${pedido.id}/recusar`, { metodo: 'POST', corpo: { motivo, detalhe } });
      await Promise.all(['pedidos', 'contadores', 'alertas'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Pedido recusado. O colaborador verá o motivo.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível recusar.');
    }
  }

  return (
    <div className="space-y-3">
      <ResumoPedido p={pedido} />
      <div role="group" aria-label="Motivo da recusa" className="flex flex-wrap gap-2">
        {MOTIVOS_RECUSA.map((m) => (
          <button key={m} type="button" aria-pressed={motivo === m} className={`chip ${motivo === m ? 'ativo' : ''}`} onClick={() => setMotivo(m)}>{m}</button>
        ))}
      </div>
      <Campo rotulo={motivo === 'Outro' ? 'Descreva o motivo' : 'Detalhe (opcional)'}>
        <textarea className="campo" rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
      </Campo>
      {erro && <p role="alert" className="text-[var(--late)]">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn perigo" onClick={recusar}>Recusar pedido</button>
      </div>
    </div>
  );
}
