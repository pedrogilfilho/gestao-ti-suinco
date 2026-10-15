'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePode } from '@/lib/usePode';

type Alerta = { tipo: 'reserva' | 'urgente' | 'pedido'; id: string; minutos: number; hora: string; texto: string };

const quando = (a: Alerta) => (a.tipo === 'urgente' ? 'URGENTE' : a.minutos > 0 ? `Em ${a.minutos} min` : a.minutos === 0 ? 'Agora' : `Há ${-a.minutos} min`);
const ACAO: Record<Alerta['tipo'], [string, string]> = {
  reserva: ['Registrar retirada', '/reservas?status=hoje'], urgente: ['Atender', '/pedidos?status=urgentes'], pedido: ['Aprovar', '/pedidos?status=pendentes'],
};

// Faixa no topo do Em uso: entregas dos próximos 15 minutos e pedidos urgentes. Atualiza a cada 30 s e pelos avisos em tempo real.
export function AlertasEntrega() {
  const reserva = usePode('reservar'), empresta = usePode('emprestar');
  const pode = reserva || empresta;
  const avisar = useAviso();
  const vistos = useRef(new Set<string>());
  const { data } = useQuery({ queryKey: ['alertas'], queryFn: () => api<{ itens: Alerta[] }>('/alertas'), enabled: pode, refetchInterval: 30_000 });
  const itens = data?.itens ?? [];
  useEffect(() => {
    for (const a of itens) {
      const k = `${a.tipo}:${a.id}`;
      if (vistos.current.has(k)) continue;
      vistos.current.add(k);
      avisar(a.tipo === 'urgente' ? 'Novo pedido de EXTREMA URGÊNCIA!' : `Atenção: entrega ${a.minutos > 0 ? `em ${a.minutos} min` : 'agora'}. Prepare o equipamento.`);
    }
  }, [itens, avisar]);
  if (!pode || !itens.length) return null;
  return (
    <section role="region" aria-label="Alertas de entrega" className="mb-4 space-y-2">
      {itens.map((a) => {
        const [rotulo, href] = ACAO[a.tipo];
        return (
          <div key={`${a.tipo}:${a.id}`} className={`card flex flex-wrap items-center gap-3 border-l-4 ${a.tipo === 'reserva' && a.minutos > 0 ? 'border-l-[var(--warn)]' : 'border-l-[var(--late)]'}`}>
            <b className={a.tipo === 'urgente' ? 'selo late' : ''}>{quando(a)}</b>
            <span className="flex-1">
              {a.tipo === 'urgente' ? 'Pedido de extrema urgência' : 'Preparar entrega'} às {a.hora}: {a.tipo === 'pedido' && <em>Pedido ainda não aprovado: </em>}{a.texto}
            </span>
            <Link className="btn" href={href}>{rotulo}</Link>
          </div>
        );
      })}
    </section>
  );
}
