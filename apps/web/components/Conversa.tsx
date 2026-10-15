'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { dataHoraBR } from '@/lib/tipos';

export type Mensagem = { id: string; de: 'colab' | 'ti' | 'sistema'; texto: string; em: string; autor: string | null };

// Conversa do pedido entre o colaborador e a TI. `lado` = quem está escrevendo nesta tela.
export function Conversa({ pedidoId, lado, nomeColab, fechado }: { pedidoId: string; lado: 'colab' | 'ti'; nomeColab: string; fechado?: boolean }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['pedidos', pedidoId, 'mensagens'], queryFn: () => api<{ itens: Mensagem[] }>(`/pedidos/${pedidoId}/mensagens`) });

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setErro('');
    try {
      await api(`/pedidos/${pedidoId}/mensagens`, { metodo: 'POST', corpo: { texto: t } });
      setTexto('');
      await qc.invalidateQueries({ queryKey: ['pedidos'] });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível enviar a mensagem.');
    }
  }
  const quem = (m: Mensagem) => (m.de === 'sistema' ? '' : m.de === 'colab' ? nomeColab : m.autor ?? 'TI');

  return (
    <div className="mt-2 rounded border border-[var(--line)] p-2" aria-label="Conversa do pedido" role="region">
      <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
        {!data?.itens.length && <li className="meta">Nenhuma mensagem ainda.</li>}
        {data?.itens.map((m) => (
          <li key={m.id} className={m.de === 'sistema' ? 'meta italic' : m.de === lado ? 'text-right' : ''}>
            <span className={m.de === 'sistema' ? '' : 'inline-block rounded bg-[var(--tag)] px-2 py-1'}>{m.texto}</span>
            <small className="meta block">{[quem(m), dataHoraBR(m.em)].filter(Boolean).join(' · ')}</small>
          </li>
        ))}
      </ul>
      {!fechado && (
        <div className="mt-2 flex gap-2">
          <input className="campo" aria-label="Mensagem" placeholder={lado === 'colab' ? 'Escreva para a TI' : 'Responder ao colaborador'} value={texto}
            onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void enviar(); } }} />
          <button type="button" className="btn ghost" onClick={enviar}>Enviar</button>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-[var(--late)]">{erro}</p>}
    </div>
  );
}
