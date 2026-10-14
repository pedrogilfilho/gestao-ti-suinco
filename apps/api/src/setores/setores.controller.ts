import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { setorSchema, excluirSetorSchema, type SetorEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { SetoresService } from './setores.service';

@Controller('setores')
export class SetoresController {
  constructor(private s: SetoresService) {}

  @EquipeTI() @Get()
  listar() { return this.s.listar(); }

  @Permissao('usuarios') @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(setorSchema)) b: SetorEntrada) { return this.s.criar(u, b); }

  @Permissao('usuarios') @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(setorSchema)) b: SetorEntrada) {
    return this.s.editar(u, id, b);
  }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(excluirSetorSchema)) b: { destinoId: string }) {
    return this.s.excluir(u, id, b.destinoId);
  }
}
