import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      TZ: 'America/Sao_Paulo',
      NODE_ENV: 'test',
      JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
      DONOS: 'dono@suinco.com.br',
      ARQUIVOS_DIR: './.arquivos-teste',
    },
  },
});
