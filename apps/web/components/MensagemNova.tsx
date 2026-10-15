'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { usePode } from '@/lib/usePode';
import { dataHoraBR, type Pedido } from '@/lib/tipos';
import { Dialogo } from './Dialogo';
import type { Mensagem } from './Conversa';

// bipe curto (como no app atual); navegador sem som não atrapalha
function bip() {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const c = new C(), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.4);
  } catch { /* sem som */ }
}

// Janela "Mensagem nova": aparece para quem atende pedidos quando um colaborador escreve. Fila de conversas.
export function MensagemNova() {
  const reserva = usePode('reservar'), empresta = usePode('emprestar');
  const atende = reserva || empresta;
  const [fila, setFila] = useState<string[]>([]);
  const [resposta, setResposta] = useState('');
  const [erro, setErro] = useState('');
  const router = useRouter();
  const qc = useQueryClient();
  const atual = fila[0];

  useEffect(() => {
    if (!atende) return;
    const h = (e: Event) => {
      const { pedidoId } = (e as CustomEvent<{ pedidoId: string }>).detail;
      setFila((f) => (f.includes(pedidoId) ? f : [...f, pedidoId]));
      bip();
    };
    window.addEventListener('gt-mensagem', h);
    return () => window.removeEventListener('gt-mensagem', h);
  }, [atende]);

  const { data: pedido } = useQuery({ queryKey: ['pedidos', atual, 'resumo'], queryFn: () => api<Pedido>(`/pedidos/${atual}`), enabled: !!atual });
  const { data: msgs } = useQuery({ queryKey: ['pedidos', atual, 'mensagens'], queryFn: () => api<{ itens: Mensagem[] }>(`/pedidos/${atual}/mensagens`), enabled: !!atual });
  const proxima = useCallback(() => { setFila((f) => f.slice(1)); setResposta(''); setErro(''); }, []);

  async function responder() {
    const t = resposta.trim();
    if (!t || !atual) return;
    try {
      await api(`/pedidos/${atual}/mensagens`, { metodo: 'POST', corpo: { texto: t } });
      await qc.invalidateQueries({ queryKey: ['pedidos'] });
      proxima();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível enviar a resposta.');
    }
  }

  const outras = fila.length - 1;
  return (
    <Dialogo titulo="Mensagem nova" aberto={!!atual} onFechar={proxima} largura="max-w-lg">
      {pedido && (
        <p className="mb-2">
          <b>{pedido.pessoa.nome}</b>
          <span className="meta block text-sm">
            {[pedido.urgente && 'URGENTE', pedido.tipo, pedido.urgente ? 'Urgência' : pedido.finalidade, pedido.pessoa.setor,
              `pedido ${pedido.status === 'pendente' ? 'aguardando aprovação' : pedido.status}`].filter(Boolean).join(' · ')}
          </span>
        </p>
      )}
      <ul className="mb-3 max-h-60 space-y-1 overflow-y-auto text-sm">
        {msgs?.itens.slice(-6).map((m) => (
          <li key={m.id} className={m.de === 'sistema' ? 'meta italic' : m.de === 'ti' ? 'text-right' : ''}>
            <span className={m.de === 'sistema' ? '' : 'inline-block rounded bg-[var(--tag)] px-2 py-1'}>{m.texto}</span>
            <small className="meta block">{m.de === 'colab' ? pedido?.pessoa.nome : m.de === 'ti' ? m.autor ?? 'TI' : ''} {dataHoraBR(m.em)}</small>
          </li>
        ))}
      </ul>
      <label className="rotulo" htmlFor="resp-msg-nova">Resposta</label>
      <input id="resp-msg-nova" className="campo" value={resposta} autoFocus onChange={(e) => setResposta(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void responder(); } }} />
      {erro && <p role="alert" className="text-sm text-[var(--late)]">{erro}</p>}
      {outras > 0 && <p className="meta mt-2 text-sm">Mais {outras} conversa{outras > 1 ? 's' : ''} com mensagem nova.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn ghost" onClick={() => { const e = pedido?.pessoa.email; proxima(); router.push(`/pedidos?status=todos${e ? `&q=${encodeURIComponent(e)}` : ''}`); }}>Abrir o pedido</button>
        <button type="button" className="btn ghost" onClick={proxima}>Fechar</button>
        <button type="button" className="btn" onClick={responder}>Responder</button>
      </div>
    </Dialogo>
  );
}
