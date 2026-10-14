import { test, expect } from '@playwright/test';
import { entrar } from './util';

test('excluir e restaurar pela Auditoria', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/equipamentos?q=NB-EMP-05');
  await page.getByRole('row', { name: /NB-EMP-05/ }).getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('dialog', { name: 'Excluir' }).getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('row', { name: /NB-EMP-05/ })).toHaveCount(0);
  await page.goto('/auditoria?area=equipamentos');
  const cartao = page.getByRole('article').filter({ hasText: 'Excluiu' }).filter({ hasText: 'NB-EMP-05' }).first();
  await cartao.getByRole('button', { name: 'Restaurar' }).click();
  await page.getByRole('dialog', { name: 'Restaurar' }).getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Restaurado.');
  await page.goto('/equipamentos?q=NB-EMP-05');
  await expect(page.getByRole('row', { name: /NB-EMP-05/ })).toHaveCount(1);
});

test('suspender acesso derruba a pessoa na hora', async ({ browser }) => {
  const tec = await (await browser.newContext()).newPage();
  await entrar(tec, 'tecnico.teste@suinco.com.br');
  await tec.goto('/em-uso');
  await expect(tec.getByRole('heading', { name: 'Em uso' })).toBeVisible();
  const adm = await (await browser.newContext()).newPage();
  await entrar(adm, 'gerson.araujo@suinco.com.br');
  await adm.goto('/acessos');
  const linha = () => adm.getByRole('row', { name: /tecnico\.teste/ });
  await linha().getByRole('button', { name: 'Mais ações' }).click();
  await adm.getByRole('menuitem', { name: 'Suspender' }).click();
  await adm.getByRole('dialog', { name: 'Suspender' }).getByRole('button', { name: 'Suspender', exact: true }).click();
  await expect(tec).toHaveURL(/\/login/, { timeout: 5000 });
  await expect(linha()).toContainText('Suspenso');
  // reativar para não afetar os outros testes
  await linha().getByRole('button', { name: 'Mais ações' }).click();
  await adm.getByRole('menuitem', { name: 'Reativar' }).click();
  await expect(linha()).not.toContainText('Suspenso');
});

test('redefinir senha mostra a senha temporária uma vez', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  // preparo: uma pessoa só deste teste, com acesso de consulta (não mexer na senha dos usuários do seed)
  const setorId = ((await (await page.request.get('/api/setores')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  const p = (await (await page.request.post('/api/pessoas', { data: { nome: 'Bia Senha', email: 'bia.senha', setorId } })).json()) as { id: string };
  await page.request.post('/api/acessos', { data: { pessoaId: p.id, papel: 'consulta' } });
  await page.goto('/acessos');
  await page.getByRole('row', { name: /bia\.senha/ }).getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Redefinir senha' }).click();
  await page.getByRole('dialog', { name: 'Redefinir senha' }).getByRole('button', { name: 'Redefinir senha', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Senha temporária' }).getByRole('button', { name: 'Copiar' })).toBeVisible();
});

test('o dono do app não tem menu para quem não é dono', async ({ page }) => {
  // preparo: o técnico ganha a permissão de acessos (e volta ao que era no fim)
  await entrar(page, 'gerson.araujo@suinco.com.br');
  type A = { id: string; pessoa: { email: string }; permissoesMarcadas: Record<string, boolean> };
  const lista = ((await (await page.request.get('/api/acessos')).json()) as { itens: A[] }).itens;
  const tec = lista.find((a) => a.pessoa.email === 'tecnico.teste@suinco.com.br')!;
  await page.request.patch(`/api/acessos/${tec.id}`, { data: { permissoes: { ...tec.permissoesMarcadas, acessos: true } } });

  await page.context().clearCookies();
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/acessos');
  const dono = page.getByRole('row', { name: /gerson\.araujo/ });
  await expect(dono).toContainText('Dono do app');
  await expect(dono.getByRole('button', { name: 'Mais ações' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /consulta\.teste/ }).getByRole('button', { name: 'Mais ações' })).toHaveCount(1);

  await page.context().clearCookies();
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.request.patch(`/api/acessos/${tec.id}`, { data: { permissoes: tec.permissoesMarcadas } });
});

test('configurações: salvar o endereço do GLPI', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/configuracoes');
  await page.getByLabel('Endereço do GLPI').fill('nao-e-url');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Endereço do GLPI inválido.')).toBeVisible();
  await page.getByLabel('Endereço do GLPI').fill('https://glpi.suinco.com.br/ticket?id=');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Configurações salvas.');
});

test('busca geral com "/" leva para a tela filtrada', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.keyboard.press('/');
  await page.keyboard.type('DESK-01');
  await page.getByRole('option', { name: /DESK-01/ }).click();
  await expect(page).toHaveURL(/\/equipamentos\?q=DESK-01/);
});

test('portal mostra Meus equipamentos', async ({ page }) => {
  await entrar(page, 'solicitante.teste@suinco.com.br');
  await expect(page.getByRole('heading', { name: 'Meus equipamentos' })).toBeVisible();
});
