'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Filtros, busca e aba ficam na URL: dá para mandar o link e o "voltar" do navegador funciona.
export function useFiltrosUrl<T extends Record<string, string>>(padrao: T): [T, (mudanca: Partial<T>) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const rota = usePathname();
  const atual = Object.fromEntries(Object.keys(padrao).map((k) => [k, sp.get(k) ?? padrao[k]])) as T;
  const mudar = (m: Partial<T>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(m)) (v ? n.set(k, v as string) : n.delete(k));
    const qs = n.toString();
    router.replace(qs ? `${rota}?${qs}` : rota, { scroll: false });
  };
  return [atual, mudar];
}
