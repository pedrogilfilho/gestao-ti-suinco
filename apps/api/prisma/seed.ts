// Dados de desenvolvimento: 4 perfis, 2 setores e alguns equipamentos. Roda no `prisma migrate reset` e no preparo dos testes de tela.
import { PrismaClient, type Papel } from '@prisma/client';
import argon2 from 'argon2';
import { PADRAO_TIC } from '@gestao/shared';

const permissoes = (l: string[]) => Object.fromEntries(l.map((p) => [p, true]));

export async function semear(db: PrismaClient, senha = process.env.SEED_SENHA ?? 'Teste@1234') {
  const ti = await db.setor.create({ data: { nome: 'TI' } });
  const adm = await db.setor.create({ data: { nome: 'Administrativo' } });
  const hash = await argon2.hash(senha, { type: argon2.argon2id });
  const gente: [string, string, string, Papel, string[]][] = [
    ['Gerson (dono)', 'gerson.araujo@suinco.com.br', ti.id, 'master', []],
    ['Técnico Teste', 'tecnico.teste@suinco.com.br', ti.id, 'tic', PADRAO_TIC],
    ['Consulta Teste', 'consulta.teste@suinco.com.br', adm.id, 'consulta', []],
    ['Solicitante Teste', 'solicitante.teste@suinco.com.br', adm.id, 'solicitante', []],
  ];
  for (const [nome, email, setorId, papel, perms] of gente) {
    const p = await db.pessoa.create({ data: { nome, email, setorId } });
    const a = await db.acesso.create({ data: { pessoaId: p.id, papel, permissoes: permissoes(perms) } });
    await db.credencialLocal.create({ data: { acessoId: a.id, senhaHash: hash, trocarNoProximoLogin: false } });
  }
  for (let i = 1; i <= 5; i++) {
    await db.equipamento.create({ data: { codigo: `NB-EMP-0${i}`, tipo: 'Notebook Empréstimo', modelo: 'Dell Latitude 3420' } });
  }
  await db.equipamento.create({ data: { codigo: 'DESK-01', tipo: 'Desktop', setorId: ti.id } });
}

if (require.main === module) {
  const db = new PrismaClient();
  semear(db).finally(() => db.$disconnect());
}
