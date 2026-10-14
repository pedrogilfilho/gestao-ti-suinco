// Uso: pnpm --filter @gestao/api importar -- <backup.json> [--ensaio]
// --ensaio: faz tudo e desfaz no final; só mostra o relatório. Rode sempre primeiro com --ensaio.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { importar, type Relatorio } from './importar/importar';

function texto(rel: Relatorio, ensaio: boolean): string {
  const l: string[] = [];
  l.push(ensaio ? 'ENSAIO (nada foi gravado)' : 'IMPORTAÇÃO GRAVADA', '');
  l.push('Criados:', ...Object.entries(rel.criados).map(([k, v]) => `  ${k}: ${v}`), '');
  l.push(`Ignorados (${rel.ignorados.length}):`, ...rel.ignorados.map((i) => `  [${i.area}] ${i.id}: ${i.motivo}`), '');
  l.push(`Avisos (${rel.avisos.length}):`, ...rel.avisos.map((a) => `  ${a}`), '');
  if (rel.senhasDonos.length && ensaio) {
    // no ensaio nada foi gravado: a senha não valeria
    l.push('Donos que vão receber senha temporária na importação de verdade:', ...rel.senhasDonos.map((s) => `  ${s.email}`), '');
  } else if (rel.senhasDonos.length) {
    l.push('Senhas temporárias dos donos (troca obrigatória no primeiro login):', ...rel.senhasDonos.map((s) => `  ${s.email}: ${s.senha}`), '');
  }
  l.push('Os demais acessos entram com uma senha temporária gerada em Acessos → Mais ações → Redefinir senha.');
  return l.join('\n');
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const ensaio = args.includes('--ensaio');
  const arquivo = args.find((a) => !a.startsWith('--'));
  if (!arquivo) {
    console.error('Uso: pnpm --filter @gestao/api importar -- <backup.json> [--ensaio]');
    process.exit(1);
  }
  const caminho = resolve(arquivo);
  const backup = JSON.parse(readFileSync(caminho, 'utf8'));
  const db = new PrismaClient();
  try {
    const rel = await importar(db, backup, { ensaio });
    const saida = texto(rel, ensaio);
    console.log(saida);
    const dia = new Date().toISOString().slice(0, 10);
    // o relatório com senha não vai para disco: só aparece na tela
    const destino = join(dirname(caminho), `relatorio-importacao-${dia}${ensaio ? '-ensaio' : ''}.txt`);
    writeFileSync(destino, texto({ ...rel, senhasDonos: [] }, ensaio), 'utf8');
    console.log(`\nRelatório salvo em ${destino}`);
  } catch (e) {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
