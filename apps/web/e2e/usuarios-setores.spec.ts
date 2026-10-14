import { test, expect, type Page } from '@playwright/test';
import { entrar } from './util';

// primeiro id que a lista da API devolve para a busca
async function idDe(page: Page, caminho: string, q: string) {
  const r = await page.request.get(`/api/${caminho}?q=${encodeURIComponent(q)}`);
  return ((await r.json()) as { itens: { id: string }[] }).itens[0]!.id;
}

test('Excluir travado mostra o motivo ao passar o mouse', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const eq = await idDe(page, 'equipamentos', 'DESK-01');
  const pessoaId = await idDe(page, 'pessoas', 'tecnico.teste@suinco.com.br');
  await page.request.post(`/api/equipamentos/${eq}/vincular`, { data: { pessoaId } });
  await page.goto('/usuarios?q=Técnico');
  const btn = page.getByRole('row', { name: /Técnico Teste/ }).getByRole('button', { name: 'Excluir' });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('title', 'Técnico Teste está com DESK-01 vinculado. Desvincule antes de excluir.');
});

test('excluir setor pede o destino e move as pessoas', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/setores');
  await page.getByRole('button', { name: 'Novo setor' }).click();
  await page.getByLabel('Nome do setor').fill('Temporário');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('article', { name: 'Temporário' }).getByRole('button', { name: 'Excluir' }).click();
  await page.getByLabel('Mover as pessoas para').selectOption({ label: 'TI' });
  await page.getByRole('button', { name: 'Excluir setor' }).click();
  await expect(page.getByRole('article', { name: 'Temporário' })).toHaveCount(0);
});

test('cadastro em massa de usuários mostra o erro da linha 2', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Cadastro em massa' }).click();
  await page.getByLabel('Cole as linhas').fill('Lia\tlia@suinco.com.br\tTI\nMeg\tmeg@gmail.com\tTI');
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('1 cadastrado')).toBeVisible();
  await expect(page.getByText('Linha 2: O e-mail precisa terminar em @suinco.com.br.')).toBeVisible();
});

test('novo usuário: e-mail sem domínio é completado e nome com HTML aparece como texto', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo usuário' });
  await dlg.getByLabel('Nome', { exact: true }).fill('<b>Ana</b> Costa');
  await dlg.getByLabel('E-mail', { exact: true }).fill('ana.costa');
  await dlg.getByLabel('Setor', { exact: true }).selectOption({ label: 'Administrativo' });
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Usuário cadastrado.');
  const linha = page.getByRole('row', { name: /<b>Ana<\/b> Costa/ });
  await expect(linha).toContainText('ana.costa@suinco.com.br');
});

test('editar mostra os equipamentos vinculados e desativar selecionados', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const setorId = ((await (await page.request.get('/api/setores')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  await page.request.post('/api/pessoas', { data: { nome: 'Rui Desativar', email: 'rui.desativar', setorId } });
  await page.goto('/usuarios?q=rui.desativar');
  const linha = page.getByRole('row', { name: /Rui Desativar/ });
  await linha.getByRole('button', { name: 'Editar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Editar usuário' });
  await expect(dlg.getByText('Nenhum equipamento vinculado.')).toBeVisible();
  await expect(dlg.getByLabel('Assinatura')).toHaveCount(0); // só técnico da TI tem assinatura
  await dlg.getByRole('button', { name: 'Cancelar' }).click();

  await linha.getByRole('checkbox', { name: 'Selecionar Rui Desativar' }).check();
  await page.getByRole('button', { name: 'Desativar selecionados' }).click();
  await page.getByRole('dialog', { name: 'Desativar' }).getByRole('button', { name: 'Desativar' }).click();
  await expect(linha).toContainText('Desativado');
});
