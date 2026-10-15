import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { reservaEdicaoSchema, reservaSchema, type ReservaEdicao, type ReservaEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { parametrosLista } from '../comum/lista';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { ReservasService, type StatusListaReserva } from './reservas.service';

const STATUS: StatusListaReserva[] = ['proximas', 'hoje', 'historico', 'todas'];

@Controller('reservas')
export class ReservasController {
  constructor(private s: ReservasService) {}

  @EquipeTI() @Get()
  listar(@Query() q: Record<string, string>) {
    const status = STATUS.includes(q.status as StatusListaReserva) ? (q.status as StatusListaReserva) : 'proximas';
    return this.s.listar({ ...parametrosLista(q), status });
  }

  @Permissao('reservar') @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(reservaSchema)) b: ReservaEntrada) { return this.s.criar(u, b); }

  @Permissao('reservar') @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reservaEdicaoSchema)) b: ReservaEdicao) {
    return this.s.editar(u, id, b);
  }

  @Permissao('reservar') @Post(':id/cancelar') @HttpCode(200)
  cancelar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.cancelar(u, id); }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }
}
