import type { Papel, Permissao } from '@gestao/shared';

export type Acesso = {
  id: string; papel: Papel; nomePapel: string; dono: boolean;
  pessoa: { id: string; nome: string; email: string; setor: string };
  grupo: { id: string; nome: string } | null; permissoesMarcadas: Partial<Record<Permissao, boolean>>; permissoes: Permissao[];
  suspenso: boolean; ultimoLoginEm: string | null; criadoEm: string; aguardandoPrimeiroLogin: boolean;
};
export type Grupo = { id: string; nome: string; permissoes: Partial<Record<Permissao, boolean>>; pessoas: number };
