import { test, expect, type Page } from '@playwright/test';
import { entrar } from './util';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// rabisca no canvas da assinatura
async function assinar(page: Page, rotulo: string) {
  const c = page.getByLabel(rotulo, { exact: true });
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 90, { steps: 5 });
  await page.mouse.move(b.x + 200, b.y + 50, { steps: 5 });
  await page.mouse.up();
}

async function idDe(page: Page, caminho: string, q: string) {
  const r = await page.request.get(`/api/${caminho}?q=${encodeURIComponent(q)}`);
  return ((await r.json()) as { itens: { id: string }[] }).itens[0]!.id;
}

async function abrirRegistro(page: Page, codigo: string, pessoa: string) {
  await page.goto('/em-uso');
  await page.getByRole('button', { name: 'Registrar empréstimo' }).click();
  const dlg = page.getByRole('dialog', { name: 'Registrar empréstimo' });
  await dlg.getByLabel('Equipamento', { exact: true }).selectOption({ label: codigo });
  await dlg.getByLabel('Colaborador', { exact: true }).fill(pessoa);
  await page.getByRole('option', { name: new RegExp(pessoa) }).click();
  await dlg.getByRole('button', { name: 'Viagem' }).click();
  return dlg;
}

test('registrar, devolver com pendência e resolver', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  const dlg = await abrirRegistro(page, 'NB-EMP-02', 'Consulta Teste');
  await dlg.getByLabel('Carregador').check();
  await dlg.getByLabel('Mouse').check();
  await assinar(page, 'Assinatura do colaborador');
  await dlg.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Empréstimo registrado.');
  const linha = page.getByRole('row', { name: /NB-EMP-02/ });
  await expect(linha).toContainText('Emprestado');

  await linha.getByRole('button', { name: 'Devolver' }).click();
  const dev = page.getByRole('dialog', { name: 'Devolver NB-EMP-02' });
  await dev.getByLabel('Mouse').uncheck();
  await assinar(page, 'Assinatura da devolução');
  await dev.getByRole('button', { name: 'Confirmar devolução' }).click();
  await page.getByRole('button', { name: 'Pendências' }).click();
  await expect(page.getByRole('row', { name: /NB-EMP-02/ })).toContainText('Devolvido com pendência');

  await page.getByRole('row', { name: /NB-EMP-02/ }).getByRole('button', { name: 'Resolver' }).click();
  const res = page.getByRole('dialog', { name: 'Resolver NB-EMP-02' });
  await res.getByLabel('Mouse').check();
  await res.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('row', { name: /NB-EMP-02/ })).toHaveCount(0);
});

test('limite: técnico vê o aviso; Master pode liberar a exceção', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const agora = Date.now();
  const r = await page.request.post('/api/emprestimos', {
    data: {
      equipamentoId: await idDe(page, 'equipamentos', 'NB-EMP-03'), pessoaId: await idDe(page, 'pessoas', 'solicitante.teste'),
      finalidade: 'Viagem', assinatura: PNG, retiradaEm: new Date(agora).toISOString(), previsaoEm: new Date(agora + 3 * 86_400_000).toISOString(),
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();

  await entrar(page, 'tecnico.teste@suinco.com.br');
  let dlg = await abrirRegistro(page, 'NB-EMP-04', 'Solicitante Teste');
  await assinar(page, 'Assinatura do colaborador');
  await dlg.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(dlg.getByText('Solicitante Teste já está com 1 Notebook Empréstimo nesse período (limite: 1). Peça para devolver um item antes, ou peça ao Administrador Master para liberar.')).toBeVisible();

  await page.context().clearCookies();
  await entrar(page, 'gerson.araujo@suinco.com.br');
  dlg = await abrirRegistro(page, 'NB-EMP-04', 'Solicitante Teste');
  await assinar(page, 'Assinatura do colaborador');
  await dlg.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByRole('button', { name: 'Liberar exceção' }).click();
  await expect(page.getByRole('row', { name: /NB-EMP-04/ })).toContainText('Solicitante Teste');
});
