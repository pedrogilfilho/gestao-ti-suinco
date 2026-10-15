import { Module } from '@nestjs/common';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';
import { MensagensService } from './mensagens.service';

@Module({ controllers: [PedidosController], providers: [PedidosService, MensagensService], exports: [PedidosService] })
export class PedidosModule {}
