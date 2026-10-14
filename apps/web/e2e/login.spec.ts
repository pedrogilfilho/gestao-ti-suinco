import { test, expect } from '@playwright/test';
import { entrar } from './util';

test('sem login vai para a tela de login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('técnico entra e cai em Em uso, com o menu do perfil', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('tecnico.teste@suinco.com.br');
  await page.getByLabel('Senha').fill('Teste@1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/em-uso/);
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu).toContainText('Equipamentos');
  await expect(menu).toContainText('Auditoria');
  await expect(menu).not.toContainText('Acessos');
  await expect(menu).not.toContainText('Configurações');
});

test('Master vê Acessos e Configurações', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu).toContainText('Acessos');
  await expect(menu).toContainText('Configurações');
});

test('senha errada mostra a mensagem da API', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('tecnico.teste@suinco.com.br');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});

test('solicitante vai para o portal', async ({ page }) => {
  await entrar(page, 'solicitante.teste@suinco.com.br');
  await expect(page).toHaveURL(/\/portal/);
});

test('sair volta ao login e a área da TI pede login de novo', async ({ page }) => {
  await entrar(page, 'consulta.teste@suinco.com.br');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/em-uso');
  await expect(page).toHaveURL(/\/login\?voltar=%2Fem-uso/);
});

test('tema escuro fica guardado', async ({ page }) => {
  await entrar(page, 'consulta.teste@suinco.com.br');
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
