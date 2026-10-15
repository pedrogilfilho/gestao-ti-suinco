import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { aprovarSchema, chamadoPedidoSchema, loteSchema, mensagemSchema, pedidoSchema, recusarSchema, type Aprovar, type PedidoEntrada } from '@gestao/shared';
import { parametrosLista } from '../comum/lista';
import { ZodPipe } from '../comum/zod.pipe';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { PedidosService } from './pedidos.service';
import { MensagensService } from './mensagens.service';
import { AnaliseService, type StatusListaPedido } from './analise.service';

const STATUS: StatusListaPedido[] = ['pendentes', 'urgentes', 'semequip', 'aprovados', 'entregues', 'recusados', 'cancelados', 'todos'];

@Controller('pedidos')
export class PedidosController {
  constructor(private s: PedidosService, private m: MensagensService, private a: AnaliseService) {}

  // TI
  @EquipeTI() @Get()
  listar(@Query() q: Record<string, string>) {
    const status = STATUS.includes(q.status as StatusListaPedido) ? (q.status as StatusListaPedido) : 'pendentes';
    return this.a.listar({ ...parametrosLista(q), status });
  }

  @Permissao('reservar') @Post('aprovar-lote') @HttpCode(200)
  lote(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(loteSchema)) b: { ids: string[] }) { return this.a.aprovarLote(u, b.ids); }

  // colaborador (a regra "só solicitante" fica no serviço, com a mensagem da spec)
  @Get('meus')
  meus(@UsuarioAtual() u: Usuario) { return this.s.meus(u); }

  @Get(':id')
  obter(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.a.obter(u, id); }

  @Permissao('reservar') @Post(':id/aprovar') @HttpCode(200)
  aprovar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(aprovarSchema)) b: Aprovar) { return this.a.aprovar(u, id, b); }

  @Permissao('reservar') @Post(':id/recusar') @HttpCode(200)
  recusar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(recusarSchema)) b: { motivo: string; detalhe: string }) {
    return this.a.recusar(u, id, b);
  }

  @Permissao('reservar') @Post(':id/avisar-sem-equipamento') @HttpCode(200)
  avisar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.a.avisarSemEquipamento(u, id); }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.a.excluir(u, id); }

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
