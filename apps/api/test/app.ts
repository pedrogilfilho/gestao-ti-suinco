import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import argon2 from 'argon2';
import type { Papel, Permissao } from '@gestao/shared';
import { AppModule } from '../src/app.module';
import { configurar } from '../src/main';

export const SENHA = 'Teste@1234';
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export async function montarApp(): Promise<{ app: INestApplication; db: PrismaClient }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = await configurar(mod.createNestApplication());
  await app.init();
  return { app, db: new PrismaClient() };
}

export async function limparBanco(db: PrismaClient) {
  await db.$executeRawUnsafe('TRUNCATE auditoria, emprestimo, equipamento, credencial_local, acesso, grupo_acesso, pessoa, setor, config, tentativa_login CASCADE');
}

export async function criarPessoaComAcesso(
  db: PrismaClient,
  papel: Papel,
  extra: { email?: string; permissoes?: Permissao[]; trocar?: boolean; setorNome?: string } = {},
) {
  const email = extra.email ?? `${papel}.${Math.random().toString(36).slice(2, 8)}@suinco.com.br`;
  const nomeSetor = extra.setorNome ?? 'TI';
  const setor = (await db.setor.findFirst({ where: { nome: nomeSetor, excluidoEm: null } })) ?? (await db.setor.create({ data: { nome: nomeSetor } }));
  const p = await db.pessoa.create({ data: { nome: email.split('@')[0]!, email, setorId: setor.id } });
  const a = await db.acesso.create({ data: { pessoaId: p.id, papel, permissoes: Object.fromEntries((extra.permissoes ?? []).map((x) => [x, true])) } });
  await db.credencialLocal.create({ data: { acessoId: a.id, senhaHash: await argon2.hash(SENHA), trocarNoProximoLogin: !!extra.trocar } });
  return { pessoaId: p.id, acessoId: a.id, email, senha: SENHA, setorId: setor.id };
}

export async function entrarComo(app: INestApplication, email: string, senha = SENHA) {
  const ag = request.agent(app.getHttpServer());
  await ag.post('/api/auth/login').send({ email, senha }).expect(200);
  return ag;
}
