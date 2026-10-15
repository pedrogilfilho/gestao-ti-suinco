import { Module } from '@nestjs/common';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { MensagensService } from './mensagens.service';
import { AnaliseService } from './analise.service';
import { AlertasService } from './alertas.service';
import { AlertasController } from './alertas.controller';

@Module({ controllers: [PedidosController, AlertasController], providers: [PedidosService, MensagensService, AnaliseService, AlertasService], exports: [PedidosService] })
export class PedidosModule {}
