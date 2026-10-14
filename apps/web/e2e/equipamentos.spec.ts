import { test, expect } from '@playwright/test';
import { entrar } from './util';

test('cadastrar, filtrar pela URL e excluir equipamento', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo equipamento' });
  await dlg.getByLabel('Nome', { exact: true }).fill('MON-E2E');
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Monitor');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Equipamento cadastrado.');
  await page.getByPlaceholder('Buscar').fill('MON-E2E');
  await expect(page).toHaveURL(/q=MON-E2E/);
  const linha = page.getByRole('row', { name: /MON-E2E/ });
  await expect(linha).toContainText('Disponível');
  await linha.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('dialog', { name: 'Excluir' }).getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('row', { name: /MON-E2E/ })).toHaveCount(0);
});

test('Nome repetido mostra o erro no campo', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo equipamento' });
  await dlg.getByLabel('Nome', { exact: true }).fill('nb-emp-01');
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Monitor');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(dlg.getByText('Já existe equipamento com esse Nome.')).toBeVisible();
});

test('campos que dependem do tipo: IP só para tipos com IP; fixo pede o endereço', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo equipamento' });
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Monitor');
  await expect(dlg.getByLabel('IP', { exact: true })).toHaveCount(0);
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Desktop');
  await dlg.getByLabel('Endereço IP').selectOption('fixo');
  await expect(dlg.getByLabel('IP', { exact: true })).toBeVisible();
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Impressora');
  await expect(dlg.getByLabel('Firmware')).toBeVisible();
});

test('vincular a um colaborador pela busca e ver Vinculado na lista', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Novo equipamento' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo equipamento' });
  await dlg.getByLabel('Nome', { exact: true }).fill('CEL-E2E');
  await dlg.getByLabel('Tipo', { exact: true }).selectOption('Celular');
  await dlg.getByLabel('Vincular a um colaborador').fill('Consulta');
  await dlg.getByRole('option', { name: /Consulta Teste/ }).click();
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await page.goto('/equipamentos?q=CEL-E2E');
  await expect(page.getByRole('row', { name: /CEL-E2E/ })).toContainText('Vinculado');
  await expect(page.getByRole('row', { name: /CEL-E2E/ })).toContainText('Consulta Teste');
});

test('filtro de Situação fica na URL', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('group', { name: 'Situação' }).getByRole('button', { name: 'Disponível' }).click();
  await expect(page).toHaveURL(/situacao=livre/);
  await expect(page.getByRole('row', { name: /NB-EMP-02/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Situação' }).getByRole('button', { name: 'Disponível' })).toHaveAttribute('aria-pressed', 'true');
});

test('cadastro em massa: grava as válidas e mostra o erro da linha', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Cadastro em massa' }).click();
  const dlg = page.getByRole('dialog', { name: 'Cadastro em massa' });
  await dlg.getByLabel('Cole as linhas').fill('LOTE-A\tMonitor\tLG 24\nLOTE-B\tGeladeira');
  await dlg.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(dlg.getByText('1 cadastrado')).toBeVisible();
  await expect(dlg.getByText('Linha 2: Tipo de equipamento inválido.')).toBeVisible();
});

test('consulta não vê os botões de alterar', async ({ page }) => {
  await entrar(page, 'consulta.teste@suinco.com.br');
  await page.goto('/equipamentos');
  await expect(page.getByRole('row', { name: /DESK-01/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo equipamento' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /DESK-01/ }).getByRole('button', { name: 'Editar' })).toHaveCount(0);
});

test('no celular a lista vira cartões', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/equipamentos?q=DESK-01');
  await expect(page.getByRole('article', { name: 'DESK-01' })).toBeVisible();
});
