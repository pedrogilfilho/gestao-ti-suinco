import { configNucleoSchema, type ConfigNucleo } from '@gestao/shared';
import type { PrismaService, Tx } from './prisma.service';

// Configuração do núcleo: o que estiver gravado, completado com os padrões do app atual.
export async function lerConfig(db: PrismaService | Tx): Promise<ConfigNucleo> {
  const r = await db.config.findUnique({ where: { chave: 'nucleo' } });
  return configNucleoSchema.parse(r?.valor ?? {});
}
