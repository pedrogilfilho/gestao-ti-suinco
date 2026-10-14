import { Module } from '@nestjs/common';
import { AcessosController, GruposController } from './acessos.controller';
import { AcessosService } from './acessos.service';

@Module({ controllers: [AcessosController, GruposController], providers: [AcessosService] })
export class AcessosModule {}
