import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { pedidoSchema, type PedidoEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { UsuarioAtual, type Usuario } from '../auth/decorators';
import { PedidosService } from './pedidos.service';

@Controller('pedidos')
export class PedidosController {
  constructor(private s: PedidosService) {}

  // colaborador (a regra "só solicitante" fica no serviço, com a mensagem da spec)
  @Get('meus')
  meus(@UsuarioAtual() u: Usuario) { return this.s.meus(u); }

  @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(pedidoSchema)) b: PedidoEntrada) { return this.s.criar(u, b); }

  @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(pedidoSchema)) b: PedidoEntrada) {
    return this.s.editar(u, id, b);
  }

  @Post(':id/cancelar') @HttpCode(200)
  cancelar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.cancelar(u, id); }
}
