// Roda antes de a API dos testes de tela subir (comando do webServer no playwright.config.ts): garante o banco gestao_e2e (no Postgres do Docker de desenvolvimento), aplica as migrações e roda o seed.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const BANCO_E2E = 'postgresql://gestao:gestao@localhost:5434/gestao_e2e';
const api = resolve(__dirname, '../../api');

export function preparar() {
  const docker = ['C:/Program Files/Docker/Docker/resources/bin/docker.exe'].find(existsSync) ?? 'docker';
  try {
    execFileSync(docker, ['exec', 'docker-postgres-1', 'createdb', '-U', 'gestao', 'gestao_e2e'], { stdio: 'pipe' });
  } catch {
    // já existe
  }
  const env = { ...process.env, DATABASE_URL: BANCO_E2E };
  execSync('pnpm exec prisma migrate deploy', { cwd: api, env, stdio: 'pipe' });
  execSync('pnpm exec tsx scripts/preparar-banco-e2e.ts', { cwd: api, env, stdio: 'inherit' });
}

preparar();
