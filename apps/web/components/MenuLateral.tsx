'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Permissao } from '@gestao/shared';
import { api } from '@/lib/api';
import { useEu } from '@/lib/sessao';

type Contadores = { atrasados: number; abertos: number; pedidosPendentes: number; pedidosUrgentes: number; pedidosComMensagem: number; reservasHoje: number };
type Item = { rotulo: string; href: string; pode?: Permissao; contador?: 'atrasados' | 'pedidosPendentes' | 'reservasHoje' };

// Só os módulos que já existem na reescrita. Os próximos entram aqui quando forem migrados.
export const MENU: { grupo: string; itens: Item[] }[] = [
  { grupo: 'Operação', itens: [{ rotulo: 'Em uso', href: '/em-uso', contador: 'atrasados' }, { rotulo: 'Pedidos', href: '/pedidos', contador: 'pedidosPendentes' }, { rotulo: 'Reservas', href: '/reservas', contador: 'reservasHoje' }] },
  { grupo: 'Cadastros', itens: [{ rotulo: 'Equipamentos', href: '/equipamentos' }, { rotulo: 'Usuários', href: '/usuarios' }, { rotulo: 'Setores', href: '/setores' }] },
  { grupo: 'Análise', itens: [{ rotulo: 'Auditoria', href: '/auditoria', pode: 'auditoria' }] },
  { grupo: 'Administração', itens: [{ rotulo: 'Configurações', href: '/configuracoes', pode: 'config' }, { rotulo: 'Acessos', href: '/acessos', pode: 'acessos' }] },
];

export function MenuLateral({ aoNavegar }: { aoNavegar?: () => void }) {
  const { eu } = useEu();
  const rota = usePathname();
  const { data: cont } = useQuery({ queryKey: ['contadores'], queryFn: () => api<Contadores>('/contadores') });
  const pode = (i: Item) => !i.pode || !!eu?.permissoes.includes(i.pode);
  return (
    <nav aria-label="Menu" className="py-4">
      {MENU.map((g) => {
        const itens = g.itens.filter(pode);
        if (!itens.length) return null;
        return (
          <div key={g.grupo} className="mb-4">
            <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{g.grupo}</p>
            {itens.map((i) => {
              const atual = rota.startsWith(i.href);
              const n = i.contador ? cont?.[i.contador] ?? 0 : 0;
              return (
                <Link
                  key={i.href} href={i.href} onClick={aoNavegar} aria-current={atual ? 'page' : undefined}
                  className={`flex items-center justify-between px-4 py-2 ${atual ? 'bg-[var(--steel)] font-semibold text-[var(--steel-ink)]' : 'hover:bg-[var(--tag)]'}`}
                >
                  {i.rotulo}
                  {n > 0 && i.contador === 'atrasados' && <span className="selo late" title="Atrasados">{n}</span>}
                  {i.contador === 'pedidosPendentes' && cont && (n > 0 || cont.pedidosComMensagem > 0) && (
                    <span className={`selo ${cont.pedidosUrgentes ? 'late' : 'warn'}`} title="Pedidos pendentes">
                      {[n ? String(n) : '', cont.pedidosUrgentes ? `${cont.pedidosUrgentes} urgente${cont.pedidosUrgentes > 1 ? 's' : ''}` : '', cont.pedidosComMensagem ? `${cont.pedidosComMensagem} msg` : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {n > 0 && i.contador === 'reservasHoje' && <span className="selo warn" title="Reservas de hoje">{n}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
