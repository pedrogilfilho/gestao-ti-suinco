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
    });
    s.on('sair', () => {
      qc.clear();
      window.location.href = '/login';
    });
    return () => { s.close(); };
  }, [qc]);
}
