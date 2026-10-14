'use client';
import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

// Rótulo + controle + erro da API naquele campo.
// O rótulo aponta para o controle pelo id (e não o envolve): assim o nome do campo é só o rótulo,
// sem o texto da opção escolhida de um <select> junto.
export function Campo({ rotulo, erro, children, className = '' }: { rotulo: string; erro?: string; children: ReactElement<{ id?: string; 'aria-invalid'?: boolean }>; className?: string }) {
  const id = useId();
  const controle = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': erro ? true : undefined }) : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="rotulo">{rotulo}</label>
      {controle}
      {erro && <span className="mt-1 block text-sm text-[var(--late)]">{erro}</span>}
    </div>
  );
}
