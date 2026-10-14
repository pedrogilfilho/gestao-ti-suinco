import type { PrismaService } from './prisma.service';

// Busca por telefone só com números ("34999990001" acha "(34) 99999-0001").
// Devolve os ids das linhas da tabela cujos telefones, sem formatação, contêm os dígitos.
export async function idsPorTelefone(db: PrismaService, tabela: 'pessoa' | 'equipamento', digitos: string): Promise<string[]> {
  if (!/^\d{3,}$/.test(digitos)) return [];
  const [a, b] = tabela === 'pessoa' ? ['telefone_corp', 'telefone_part'] : ['numero_corp', 'numero_part'];
  const linhas = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id::text FROM ${tabela} WHERE excluido_em IS NULL AND regexp_replace(coalesce(${a}, '') || ' ' || coalesce(${b}, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'`,
    digitos,
  );
  return linhas.map((l) => l.id);
}
