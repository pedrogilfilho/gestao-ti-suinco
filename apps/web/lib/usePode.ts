'use client';
import type { Permissao } from '@gestao/shared';
import { useEu } from './sessao';

// Só para esconder/travar botões: quem barra de verdade é a API.
export const usePode = (p: Permissao) => !!useEu().eu?.permissoes.includes(p);
