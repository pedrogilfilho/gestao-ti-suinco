import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { chamadoPedidoSchema, mensagemSchema, pedidoSchema, type PedidoEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { PedidosService } from './pedidos.service';
import { MensagensService } from './mensagens.service';

@Controller('pedidos')
export class PedidosController {
  constructor(private s: PedidosService, private m: MensagensService) {}

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

  // conversa (dono ou TI; a checagem fica no serviço)
  @Get(':id/mensagens')
  mensagens(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.m.listar(u, id); }

  @Post(':id/mensagens')
  enviar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(mensagemSchema)) b: { texto: string }) {
    return this.m.enviar(u, id, b.texto);
  }

  @Permissao('reservar') @Patch(':id/chamado')
  chamado(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(chamadoPedidoSchema)) b: { chamadoGlpi: string }) {
    return this.m.trocarChamado(u, id, b.chamadoGlpi);
  }
}
