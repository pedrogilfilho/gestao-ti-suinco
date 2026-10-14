'use client';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function BotaoSair() {
  const qc = useQueryClient();
  async function sair() {
    await api('/auth/logout', { metodo: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.href = '/login';
  }
  return <button type="button" className="btn ghost" onClick={sair}>Sair</button>;
}
