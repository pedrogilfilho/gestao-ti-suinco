import { test, expect, type Page } from '@playwright/test';
import { entrar } from './util';

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const em = (dias: number, hm: string) => new Date(`${diaSP(new Date(Date.now() + dias * 86_400_000))}T${hm}:00-03:00`);

async function assinar(page: Page, rotulo: string) {
  const c = page.getByLabel(rotulo, { exact: true });
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 40);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 90, { steps: 5 });
  await page.mouse.up();
}
// pessoa só deste teste (não mexer nos usuários do seed)
async function novaPessoa(page: Page, nome: string, email: string) {
  const setorId = ((await (await page.request.get('/api/setores')).json()) as { itens: { id: string }[] }).itens[0]!.id;
  return ((await (await page.request.post('/api/pessoas', { data: { nome, email, setorId } })).json()) as { id: string }).id;
}
const idEquip = async (page: Page, codigo: string) =>
  ((await (await page.request.get(`/api/equipamentos?q=${codigo}`)).json()) as { itens: { id: string }[] }).itens[0]!.id;

test('reserva amanhã e registrar retirada vira empréstimo', async ({ page }) => {
  await entrar(page, 'tecnico.teste@suinco.com.br');
  await novaPessoa(page, 'Rita Reserva', 'rita.reserva');
  await page.goto('/reservas');
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova reserva' });
  await dlg.getByLabel('Colaborador', { exact: true }).fill('Rita');
  await page.getByRole('option', { name: /Rita Reserva/ }).click();
  await dlg.getByLabel('Data', { exact: true }).fill(diaSP(em(1, '08:00')));
  await dlg.getByLabel('Início', { exact: true }).fill('08:00');
  await dlg.getByLabel('Fim', { exact: true }).fill('12:00');
  await dlg.getByLabel('Equipamento', { exact: true }).selectOption({ label: 'NB-EMP-01 · Dell Latitude 3420' });
  await dlg.getByRole('button', { name: 'Treinamento' }).click();
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Reserva criada.');
  const linha = page.getByRole('row', { name: /NB-EMP-01 — Rita Reserva/ });
  await expect(linha).toContainText('Reservada');

  await linha.getByRole('button', { name: 'Registrar retirada' }).click();
  const emp = page.getByRole('dialog', { name: 'Registrar retirada de NB-EMP-01' });
  await expect(emp.getByText(/Rita Reserva/)).toBeVisible();
  await assinar(page, 'Assinatura do colaborador');
  await emp.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Empréstimo registrado.');
  await page.getByRole('button', { name: 'Histórico' }).click();
  await expect(page.getByRole('row', { name: /NB-EMP-01 — Rita Reserva/ })).toContainText('Retirada (empréstimo)');
  await page.goto('/em-uso');
  await expect(page.getByRole('row', { name: /NB-EMP-01 — Rita Reserva/ })).toBeVisible();
});

test('equipamento ocupado aparece desabilitado com o motivo', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  const pessoaId = await novaPessoa(page, 'Otto Ocupa', 'otto.ocupa');
  const r = await page.request.post('/api/reservas', {
    data: { pessoaId, equipamentoId: await idEquip(page, 'NB-EMP-05'), inicioEm: em(2, '08:00').toISOString(), fimEm: em(2, '12:00').toISOString() },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  await page.goto('/reservas');
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nova reserva' });
  await dlg.getByLabel('Data', { exact: true }).fill(diaSP(em(2, '08:00')));
  await dlg.getByLabel('Início', { exact: true }).fill('09:00');
  await dlg.getByLabel('Fim', { exact: true }).fill('10:00');
  const op = dlg.getByRole('option', { name: /NB-EMP-05.*Indisponível: já reservado por Otto Ocupa das 08:00 às 12:00/ });
  await expect(op).toBeDisabled();
});

test('configuração do expediente salva e volta', async ({ page }) => {
  await entrar(page, 'gerson.araujo@suinco.com.br');
  await page.goto('/configuracoes');
  await page.getByLabel('Ligar o horário de atendimento').check();
  await page.getByLabel('Sábado').check();
  await page.getByLabel('Antecedência mínima da retirada (minutos)').fill('30');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Configurações salvas.');
  await page.reload();
  await expect(page.getByLabel('Ligar o horário de atendimento')).toBeChecked();
  await expect(page.getByLabel('Antecedência mínima da retirada (minutos)')).toHaveValue('30');
  // volta ao padrão para não afetar os outros testes
  await page.getByLabel('Ligar o horário de atendimento').uncheck();
  await page.getByLabel('Sábado').uncheck();
  await page.getByLabel('Antecedência mínima da retirada (minutos)').fill('15');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Configurações salvas.');
});
