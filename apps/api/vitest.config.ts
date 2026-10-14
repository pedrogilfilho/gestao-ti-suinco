import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'], environment: 'node' },
});
