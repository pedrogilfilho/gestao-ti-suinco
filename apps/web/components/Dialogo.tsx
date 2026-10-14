'use client';
import { useEffect, useId, type ReactNode } from 'react';

// Janela sobre a tela. Esc ou o fundo fecham.
export function Dialogo({ titulo, aberto, onFechar, children, largura = 'max-w-2xl' }: {
  titulo: string; aberto: boolean; onFechar: () => void; children: ReactNode; largura?: string;
}) {
  const id = useId();
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={`card mt-8 w-full ${largura}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={id} className="text-lg font-semibold">{titulo}</h2>
          <button type="button" className="link" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
