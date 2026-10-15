import { test, expect, type Browser, type Page } from '@playwright/test';
import { entrar } from './util';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const em = (dias: number, hm: string) => new Date(`${diaSP(new Date(Date.now() + dias * 86_400_000))}T${hm}:00-03:00`);

// Cada teste cria o seu colaborador (pessoa + acesso de Solicitante + troca da senha temporária):
// assim os empréstimos que os outros testes deixam com o Solicitante Teste não pesam no limite.
const NOVA = 'Pedido@2026x';
async function comoSolicitante(browser: Browser, nome: string) {
  const adm = await (await browser.newContext()).newPage();
  await entrar(adm, 'gerson.araujo@suinco.com.br');
  const setorId = ((await (await adm.request.get('/api/setores')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  const email = nome.toLowerCase().replace(/\s+/g, '.');
  const p = (await (await adm.request.post('/api/pessoas', { data: { nome, email, setorId } })).json()) as { id: string };
  const a = (await (await adm.request.post('/api/acessos', { data: { pessoaId: p.id, papel: 'solicitante' } })).json()) as { senhaTemporaria: string };
  await adm.context().close();
  const page = await (await browser.newContext()).newPage();
  await entrar(page, `${email}@suinco.com.br`, a.senhaTemporaria);
  await page.getByLabel('Senha atual (a temporária)').fill(a.senhaTemporaria);
  await page.getByLabel('Nova senha', { exact: true }).fill(NOVA);
  await page.getByLabel('Repita a nova senha').fill(NOVA);
  await page.getByRole('button', { name: 'Salvar e entrar' }).click();
  await expect(page).toHaveURL(/\/portal/);
  return page;
}
async function pedir(sol: Page, chamado: string, dias: number, extra: Record<string, unknown> = {}) {
  const r = await sol.request.post('/api/pedidos', {
    data: {
      urgente: false, tipo: 'Notebook Empréstimo', finalidade: 'Viagem', chamadoGlpi: chamado, retiradaEm: em(dias, '09:00').toISOString(),
      devolucaoEm: em(dias, '17:00').toISOString(), assinatura: PNG, telefonesConferem: false, telefoneCorp: '(34) 99999-1234', ...extra,
    },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return ((await r.json()) as { id: string }).id;
}
async function assinar(page: Page, rotulo: string) {
  const c = page.getByLabel(rotulo, { exact: true });
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 90, { steps: 5 });
  await page.mouse.up();
}
const cartao = (page: Page, chamado: string) => page.getByRole('article', { name: /^Pedido de / }).filter({ hasText: `Chamado GLPI ${chamado}` });

test('aprovar e reservar, registrar retirada e o colaborador vê Entregue', async ({ page, browser }) => {
  const sol = await comoSolicitante(browser, 'Paulo Pedido');
  await pedir(sol, '7070', 10);
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/pedidos');
  const c = cartao(page, '7070');
  await c.getByRole('button', { name: 'Aprovar e reservar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Aprovar pedido' });
  await expect(dlg.getByLabel('Equipamento', { exact: true })).not.toHaveValue('');
  await dlg.getByRole('button', { name: 'Aprovar e reservar' }).click();
  await expect(page.getByRole('status')).toContainText('reservado para');
  await page.getByRole('button', { name: 'Aprovados' }).click();
  await expect(cartao(page, '7070')).toContainText('Aprovado');

  await cartao(page, '7070').getByRole('button', { name: 'Registrar retirada' }).click();
  const emp = page.getByRole('dialog', { name: /^Registrar retirada de NB-EMP-/ });
  await assinar(page, 'Assinatura do colaborador');
  await emp.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Empréstimo registrado.');

  await sol.goto('/portal');
  await expect(sol.getByRole('article', { name: /Pedido de Notebook Empréstimo/ }).filter({ hasText: '7070' })).toContainText('Entregue');
  // devolve pela API para não prender o notebook nos outros testes
  const l = (await (await page.request.get('/api/emprestimos?q=7070')).json()) as { itens: { id: string }[] };
  const dev = await page.request.post(`/api/emprestimos/${l.itens[0]!.id}/devolver`, { data: { assinatura: PNG } });
  expect(dev.ok(), await dev.text()).toBeTruthy();
});

test('recusa com motivo: o colaborador vê o motivo', async ({ page, browser }) => {
  const sol = await comoSolicitante(browser, 'Rui Recusa');
  await pedir(sol, '8080', 11);
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/pedidos');
  await cartao(page, '8080').getByRole('button', { name: 'Recusar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Recusar pedido' });
  await dlg.getByRole('button', { name: 'Pedido sem autorização do gestor' }).click();
  await dlg.getByRole('button', { name: 'Recusar pedido' }).click();
  await expect(page.getByRole('status')).toHaveText('Pedido recusado. O colaborador verá o motivo.');
  await sol.goto('/portal');
  await expect(sol.getByRole('article', { name: /Pedido de Notebook Empréstimo/ }).filter({ hasText: '8080' })).toContainText('Motivo: Pedido sem autorização do gestor');
});

test('mensagem do colaborador abre a janela de mensagem nova na TI', async ({ page, browser }) => {
  const sol = await comoSolicitante(browser, 'Mara Mensagem');
  const id = await pedir(sol, '9090', 12);
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/em-uso');
  await page.waitForLoadState('networkidle');
  await sol.request.post(`/api/pedidos/${id}/mensagens`, { data: { texto: 'Posso retirar mais cedo?' } });
  const dlg = page.getByRole('dialog', { name: 'Mensagem nova' });
  await expect(dlg).toContainText('Posso retirar mais cedo?');
  await dlg.getByLabel('Resposta').fill('Pode sim');
  await dlg.getByRole('button', { name: 'Responder' }).click();
  await expect(dlg).toHaveCount(0);
  const ms = (await (await sol.request.get(`/api/pedidos/${id}/mensagens`)).json()) as { itens: { texto: string }[] };
  expect(ms.itens.map((m) => m.texto)).toContain('Pode sim');
});

test('aprovar em lote mostra quem ficou pendente', async ({ page, browser }) => {
  const sol = await comoSolicitante(browser, 'Lia Lote');
  for (const ch of ['6061', '6062']) await pedir(sol, ch, 13, { confirmarRepetido: true });
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await page.goto('/pedidos');
  for (const ch of ['6061', '6062']) await cartao(page, ch).getByRole('checkbox', { name: 'Selecionar para aprovar em lote' }).check();
  await page.getByRole('button', { name: 'Aprovar selecionados (2)' }).click();
  await page.getByRole('dialog', { name: 'Aprovar selecionados' }).getByRole('button', { name: 'Aprovar selecionados' }).click();
  const r = page.getByRole('dialog', { name: 'Aprovação em lote' });
  await expect(r).toContainText('1 pedido aprovado');
  await expect(r).toContainText('Lia Lote: atingiu o limite de Notebook Empréstimo nesse período');
});

test('alerta de reserva começando em 10 minutos no Em uso', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const setorId = ((await (await page.request.get('/api/setores')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  const pessoaId = ((await (await page.request.post('/api/pessoas', { data: { nome: 'Alice Alerta', email: 'alice.alerta', setorId } })).json()) as { id: string }).id;
  const eq = ((await (await page.request.get('/api/equipamentos?q=NB-EMP-05')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  const r = await page.request.post('/api/reservas', {
    data: { pessoaId, equipamentoId: eq, inicioEm: new Date(Date.now() + 10 * 60_000).toISOString(), fimEm: new Date(Date.now() + 70 * 60_000).toISOString() },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.goto('/em-uso');
  const alerta = page.getByRole('region', { name: 'Alertas de entrega' });
  await expect(alerta).toContainText('NB-EMP-05 para Alice Alerta');
  await expect(alerta).toContainText(/Em (9|10) min/);
  await page.request.post(`/api/reservas/${((await r.json()) as { id: string }).id}/cancelar`);
});
