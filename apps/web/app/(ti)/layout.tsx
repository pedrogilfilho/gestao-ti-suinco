'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEu } from '@/lib/sessao';
import { useTempoReal } from '@/lib/tempoReal';
import { MensagemNova } from '@/components/MensagemNova';
import { MenuLateral } from '@/components/MenuLateral';
import { BarraTopo } from '@/components/BarraTopo';

function AreaTI({ children }: { children: ReactNode }) {
  useTempoReal();
  const [gaveta, setGaveta] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside className="w-60 shrink-0 border-r border-[var(--line)] bg-[var(--panel)] max-md:hidden">
        <p className="px-4 pt-4 font-semibold">Gestão de TI · Suinco</p>
        <MenuLateral />
      </aside>
      {gaveta && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Menu" onClick={() => setGaveta(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-[var(--panel)]" onClick={(e) => e.stopPropagation()}>
            <MenuLateral aoNavegar={() => setGaveta(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <BarraTopo esquerda={<button type="button" className="btn ghost md:hidden" aria-label="Abrir menu" onClick={() => setGaveta(true)}>☰</button>} />
        <main className="p-4">{children}</main>
        <MensagemNova />
      </div>
    </div>
  );
}

// Só a equipe da TI entra aqui; solicitante vai para o portal, troca de senha pendente vai para a troca.
export default function LayoutTI({ children }: { children: ReactNode }) {
  const { eu } = useEu();
  const router = useRouter();
  useEffect(() => {
    if (!eu) return;
    if (eu.trocarSenha) router.replace('/trocar-senha');
    else if (!eu.equipeTI) router.replace('/portal');
  }, [eu, router]);
  if (!eu?.equipeTI || eu.trocarSenha) return null;
  return <AreaTI>{children}</AreaTI>;
}
