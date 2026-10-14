'use client';
import type { ReactNode } from 'react';
import { NOMES_PAPEL } from '@gestao/shared';
import { useEu } from '@/lib/sessao';
import { BotaoTema } from './BotaoTema';
import { BotaoSair } from './BotaoSair';

export function BarraTopo({ esquerda }: { esquerda?: ReactNode }) {
  const { eu } = useEu();
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2">
      {esquerda}
      <div className="flex-1" />
      <BotaoTema />
      {eu && (
        <span className="hidden text-right text-sm leading-tight sm:block">
          <b>{eu.nome}</b><br /><span className="meta">{eu.dono ? 'Administrador Master (dono do app)' : NOMES_PAPEL[eu.papel]}</span>
        </span>
      )}
      <BotaoSair />
    </header>
  );
}
