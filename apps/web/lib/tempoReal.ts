'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

// Avisos da API: "mudou" faz a tela buscar de novo; "sair" leva ao login (acesso suspenso ou sessão encerrada).
export function useTempoReal() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = io({ path: '/socket.io', withCredentials: true });
    s.on('mudou', ({ area }: { area: string }) => {
      void qc.invalidateQueries({ queryKey: [area] });
      void qc.invalidateQueries({ queryKey: ['contadores'] });
      void qc.invalidateQueries({ queryKey: ['alertas'] });
    });
    // mensagem nova do colaborador num pedido: a janela "Mensagem nova" (MensagemNova) ouve este evento
    s.on('mensagem', ({ pedidoId }: { pedidoId: string }) => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
      window.dispatchEvent(new CustomEvent('gt-mensagem', { detail: { pedidoId } }));
    });
    s.on('sair', () => {
      qc.clear();
      window.location.href = '/login';
    });
    return () => { s.close(); };
  }, [qc]);
}
