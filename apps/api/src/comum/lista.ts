// Paginação por cursor: pede limite+1 itens para saber se há próxima página.
export function paginar<T extends { id: string }>(itens: T[], limite: number): { itens: T[]; proximo: string | null } {
  const temMais = itens.length > limite;
  return { itens: itens.slice(0, limite), proximo: temMais ? itens[limite - 1]!.id : null };
}

export function parametrosLista(q: Record<string, string | undefined>): { q: string; cursor?: string; limite: number } {
  const n = Number(q.limite);
  return { q: (q.q ?? '').trim(), cursor: q.cursor || undefined, limite: Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50 };
}

// vários termos: todos precisam aparecer (em qualquer campo)
export const termos = (q: string) => q.split(/\s+/).map((t) => t.trim()).filter(Boolean);
