'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEu, inicioDe } from '@/lib/sessao';

// Raiz: manda cada perfil para a sua página inicial (sem login, a chamada leva ao /login).
export default function Inicio() {
  const { eu } = useEu();
  const router = useRouter();
  useEffect(() => { if (eu) router.replace(inicioDe(eu)); }, [eu, router]);
  return null;
}
