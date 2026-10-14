'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEu } from '@/lib/sessao';
import { useTempoReal } from '@/lib/tempoReal';
import { BarraTopo } from '@/components/BarraTopo';

function Portal({ children }: { children: ReactNode }) {
  useTempoReal();
  return (
    <div className="min-h-dvh">
      <BarraTopo esquerda={<span className="font-semibold">Gestão de TI · Suinco</span>} />
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  );
}

// Portal do colaborador. A TI também pode abrir (para conferir o que o colaborador vê).
export default function LayoutPortal({ children }: { children: ReactNode }) {
  const { eu } = useEu();
  const router = useRouter();
  useEffect(() => { if (eu?.trocarSenha) router.replace('/trocar-senha'); }, [eu, router]);
  if (!eu || eu.trocarSenha) return null;
  return <Portal>{children}</Portal>;
}
