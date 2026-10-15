import { test, expect, type Page } from '@playwright/test';
import { entrar } from './util';

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
// daqui a 10 dias: longe dos empréstimos que os outros testes fazem para o Solicitante Teste (limite)
const dia10 = () => diaSP(new Date(Date.now() + 10 * 86_400_000));

async function assinar(page: Page) {
  const c = page.getByLabel('Sua assinatura', { exact: true });
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 90, { steps: 5 });
  await page.mouse.up();
}
// confirma os telefones do cadastro ou informa um, conforme o caso
async function telefones(page: Page) {
  const certos = page.getByRole('button', { name: 'Estão certos' });
  if (await certos.isVisible()) await certos.click();
  else await page.getByLabel('Telefone corporativo').fill('(34) 99999-1234');
}

test('pedido normal: aparece em Minhas solicitações aguardando a TI', async ({ page }) => {
  await entrar(page, 'solicitante.teste@suinco.com.br');
  await page.getByRole('button', { name: 'Viagem' }).click();
  await page.getByLabel('Chamado GLPI').fill('3030');
  await page.getByLabel('Retirada', { exact: true }).fill(`${dia10()}T09:00`);
  await page.getByLabel('Devolução', { exact: true }).fill(`${dia10()}T17:00`);
  await telefones(page);
  await assinar(page);
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await expect(page.getByRole('status')).toHaveText('Solicitação enviada! Acompanhe abaixo.');
  const meu = page.getByRole('article', { name: /Pedido de Notebook Empréstimo/ }).filter({ hasText: '3030' });
  await expect(meu).toContainText('Aguardando a TI');

  await meu.getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByRole('dialog', { name: 'Cancelar pedido' }).getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(meu).toContainText('Cancelado');
});

test('urgente: sem justificativa mostra o erro; texto com HTML aparece como texto', async ({ page }) => {
  let alerta = false;
  page.on('dialog', async (d) => { alerta = true; await d.dismiss(); });
  // os testes de Em uso deixam notebooks com o Solicitante Teste: o Master aumenta o limite dele para o urgente passar
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const p = ((await (await page.request.get('/api/pessoas?q=solicitante.teste')).json()) as { itens: { id: string; nome: string; setorId: string }[] }).itens[0]!;
  const r = await page.request.patch(`/api/pessoas/${p.id}`, { data: { nome: p.nome, setorId: p.setorId, limites: { 'Notebook Empréstimo': 10 } } });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.context().clearCookies();
  await entrar(page, 'solicitante.teste@suinco.com.br');
  await page.getByRole('button', { name: 'Urgente' }).click();
  await telefones(page);
  await assinar(page);
  await page.getByRole('button', { name: 'Enviar pedido urgente' }).click();
  await expect(page.getByText('Explique por que o pedido é urgente.')).toBeVisible();
  await page.getByLabel('Por que é urgente?').fill('<img src=x onerror=alert(1)> reunião agora');
  await page.getByRole('button', { name: 'Enviar pedido urgente' }).click();
  await expect(page.getByRole('status')).toHaveText('Pedido URGENTE enviado direto para aprovação.');
  await expect(page.getByText('<img src=x onerror=alert(1)> reunião agora')).toBeVisible();
  expect(alerta).toBe(false);
});

test('a TI no portal vê só Meus equipamentos', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Meus equipamentos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Solicitar empréstimo de equipamento' })).toHaveCount(0);
});
