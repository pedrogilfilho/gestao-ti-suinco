// Prepara o banco dos testes de tela (gestao_e2e): limpa as tabelas e roda o seed.
// Recusa qualquer banco cujo nome não termine em _e2e, para nunca limpar o banco de desenvolvimento por engano.
import { PrismaClient } from '@prisma/client';
import { semear } from '../prisma/seed';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/\/[a-z0-9_]+_e2e(\?|$)/.test(url)) throw new Error(`Banco recusado: ${url.replace(/\/\/.*@/, '//***@')} (precisa terminar em _e2e)`);
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe('TRUNCATE auditoria, emprestimo, equipamento, credencial_local, acesso, grupo_acesso, pessoa, setor, config, tentativa_login CASCADE');
    await semear(db);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
