import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { FiltroErros } from './comum/erros';

export async function configurar(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new FiltroErros());
  return app;
}

async function iniciar() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET ausente ou curto (mínimo 32 caracteres)');
  const app = await configurar(await NestFactory.create(AppModule));
  await app.listen(Number(process.env.PORTA ?? 3001));
}

if (require.main === module) void iniciar();
