import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

let pg: StartedPostgreSqlContainer;

export async function setup() {
  pg = await new PostgreSqlContainer('postgres:17-alpine').start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });
}

export async function teardown() {
  await pg?.stop();
}
