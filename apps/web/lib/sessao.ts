'use client';
import { useQuery } from '@tanstack/react-query';
import type { Papel, Permissao } from '@gestao/shared';
import { api } from './api';

export type Eu = {
  nome: string; email: string; pessoaId: string; papel: Papel; dono: boolean;
  permissoes: Permissao[]; equipeTI: boolean; trocarSenha: boolean;
};

export function useEu() {
  const q = useQuery({ queryKey: ['eu'], queryFn: () => api<Eu>('/auth/eu'), staleTime: 60_000 });
  return { eu: q.data, carregando: q.isLoading, erro: q.error };
}

// Página inicial de cada perfil depois do login
export const inicioDe = (eu: Eu) => (eu.trocarSenha ? '/trocar-senha' : eu.equipeTI ? '/em-uso' : '/portal');
