'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Aviso rápido no canto da tela ("Equipamento cadastrado.").
const Ctx = createContext<(msg: string) => void>(() => undefined);
export const useAviso = () => useContext(Ctx);

export function AvisoProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const avisar = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 4000);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div role="status" aria-live="polite" className={msg ? 'fixed right-4 bottom-4 z-50 card shadow-lg' : 'sr-only'}>{msg}</div>
    </Ctx.Provider>
  );
}
