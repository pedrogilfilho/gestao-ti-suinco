import { Module } from '@nestjs/common';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { MensagensService } from './mensagens.service';
import { AnaliseService } from './analise.service';

@Module({ controllers: [PedidosController], providers: [PedidosService, MensagensService, AnaliseService], exports: [PedidosService] })
export class PedidosModule {}
