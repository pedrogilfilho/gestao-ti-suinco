import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configurar } from '../src/main';

export async function montarApp(): Promise<{ app: INestApplication; db: PrismaClient }> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = await configurar(mod.createNestApplication());
  await app.init();
  return { app, db: new PrismaClient() };
}

export async function limparBanco(db: PrismaClient) {
  await db.$executeRawUnsafe('TRUNCATE auditoria, emprestimo, equipamento, credencial_local, acesso, grupo_acesso, pessoa, setor, config, tentativa_login CASCADE');
}
