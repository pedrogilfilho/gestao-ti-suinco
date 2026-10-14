import type { Tx } from './prisma.service';

export type Area = 'setores' | 'pessoas' | 'equipamentos' | 'emprestimos' | 'acessos' | 'grupos' | 'config' | 'auth';
export type Acao = 'criar' | 'editar' | 'excluir' | 'restaurar' | 'login' | 'suspender' | 'reativar' | 'forcar_logout' | 'senha' | 'devolver' | 'resolver';

const SENSIVEIS = new Set(['senhaHash', 'senha', 'nova', 'atual']);
const limpar = (v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !SENSIVEIS.has(k)))
    : v;

// Grava a auditoria pelo cliente da transação: se a alteração falhar, o registro some junto.
export async function auditar(
  tx: Tx,
  r: { atorId: string | null; acao: Acao; area: Area; itemId: string | null; antes?: unknown; depois?: unknown },
) {
  await tx.auditoria.create({
    data: { atorId: r.atorId, acao: r.acao, area: r.area, itemId: r.itemId, antes: limpar(r.antes) as never, depois: limpar(r.depois) as never },
  });
}
