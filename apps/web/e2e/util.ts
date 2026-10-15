import { expect, type Page } from '@playwright/test';

export const SENHA = 'Teste@1234';

// Entra pela tela de login e espera a página inicial do perfil.
export async function entrar(page: Page, email: string, senha = SENHA) {
  // a página anterior pode estar indo sozinha para o login (sessão encerrada); se a navegação for interrompida, tenta de novo
  try { await page.goto('/login'); } catch { await page.goto('/login'); }
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
