import { test, expect } from '@playwright/test';
import { entrar } from './util';

test('cadastrar, buscar, editar e excluir um ramal', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/ramais');
  await page.getByRole('button', { name: 'Novo ramal' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo ramal' });
  await dlg.getByLabel('Ramal', { exact: true }).fill('2345');
  await dlg.getByLabel('Descrição').fill('Recepção Teste');
  await dlg.getByLabel('Setor').fill('Portaria Teste');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Ramal cadastrado.');

  await page.getByLabel('Buscar ramal').fill('2345');
  const linha = page.getByRole('row', { name: /2345/ });
  await expect(linha).toContainText('Recepção Teste');

  await linha.getByRole('button', { name: 'Editar' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar ramal' });
  await edit.getByLabel('Descrição').fill('Recepção Nova');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: /2345/ })).toContainText('Recepção Nova');

  await page.getByRole('row', { name: /2345/ }).getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('row', { name: /2345/ })).toHaveCount(0);
});

test('a descrição com HTML aparece como texto', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const numero = `23${Date.now() % 100000}`; // número próprio deste teste (sobrevive a retry/execução em suíte)
  await page.request.post('/api/ramais', { data: { numero, descricao: '<b>Chefia</b>', setor: 'TI' } });
  await page.goto('/ramais');
  await page.getByLabel('Buscar ramal').fill(numero);
  await expect(page.getByRole('row', { name: new RegExp(numero) }).first()).toContainText('<b>Chefia</b>');
});
