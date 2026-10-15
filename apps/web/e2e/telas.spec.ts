import { test, expect } from '@playwright/test';
import { entrar } from './util';

const TELAS = ['/em-uso', '/pedidos', '/reservas', '/equipamentos', '/usuarios', '/setores', '/auditoria', '/configuracoes', '/acessos'];

// No celular (390 px) nenhuma tela pode ter rolagem para o lado, nos dois temas.
for (const tema of ['light', 'dark'] as const) {
  test(`telas cabem em 390 px (tema ${tema})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((t) => localStorage.setItem('gt-tema', t), tema);
    await entrar(page, 'gerson.araujo@suinco.com.br');
    for (const t of TELAS) {
      await page.goto(t);
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, `${t} tem ${sobra}px de rolagem lateral`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/telas/${tema}-390${t.replace('/', '-')}.png`, fullPage: true });
    }
  });
}

test('portal cabe em 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, 'solicitante.teste@suinco.com.br');
  await expect(page.getByRole('heading', { name: 'Meus equipamentos' })).toBeVisible();
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
});
