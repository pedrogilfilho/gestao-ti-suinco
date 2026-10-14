'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Dialogo } from '@/components/Dialogo';

// Pergunta de confirmação que devolve uma promessa: if (await perguntar('...', 'Excluir')) { ... }
type Pergunta = { titulo: string; texto: string; ok: string; perigo?: boolean; resolver: (r: boolean) => void };
type Perguntar = (texto: string, ok: string, opcoes?: { titulo?: string; perigo?: boolean }) => Promise<boolean>;
const Ctx = createContext<Perguntar>(async () => false);
export const usePerguntar = () => useContext(Ctx);

export function PerguntaProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Pergunta | null>(null);
  const perguntar = useCallback<Perguntar>((texto, ok, o = {}) =>
    new Promise((resolver) => setP({ titulo: o.titulo ?? ok, texto, ok, perigo: o.perigo, resolver })), []);
  const fechar = (r: boolean) => { p?.resolver(r); setP(null); };
  return (
    <Ctx.Provider value={perguntar}>
      {children}
      <Dialogo titulo={p?.titulo ?? ''} aberto={!!p} onFechar={() => fechar(false)} largura="max-w-md">
        <p className="mb-6 whitespace-pre-line">{p?.texto}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn ghost" onClick={() => fechar(false)}>Cancelar</button>
          <button type="button" className={`btn ${p?.perigo ? 'perigo' : ''}`} onClick={() => fechar(true)} autoFocus>{p?.ok}</button>
        </div>
      </Dialogo>
    </Ctx.Provider>
  );
}
