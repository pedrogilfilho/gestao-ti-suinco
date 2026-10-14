import { defineConfig, devices } from '@playwright/test';

// Portas próprias dos testes (3100 web, 3101 API), para não brigar com o `pnpm dev`.
const env = {
  DATABASE_URL: 'postgresql://gestao:gestao@localhost:5434/gestao_e2e',
  JWT_SECRET: 'segredo-dos-testes-de-tela-com-mais-de-32-caracteres',
  DONOS: 'gerson.araujo@suinco.com.br',
  ARQUIVOS_DIR: './.arquivos-e2e',
  TZ: 'America/Sao_Paulo',
  PORTA: '3101',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx ../web/e2e/preparar-banco.ts && pnpm exec nest start',
      cwd: '../api',
      env,
      url: 'http://localhost:3101/api/config',
      // /api/config pede login: 401 já mostra que a API subiu
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec next dev -p 3100',
      env: { API_INTERNA: 'http://localhost:3101' },
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
