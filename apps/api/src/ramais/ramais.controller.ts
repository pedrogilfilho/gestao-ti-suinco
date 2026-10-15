import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ramalSchema, type RamalEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { RamaisService } from './ramais.service';

@Controller('ramais')
export class RamaisController {
  constructor(private s: RamaisService) {}

  // lista pública (qualquer pessoa logada, inclusive solicitante) — usada no portal
  @Get('lista')
  lista(@Query('q') q?: string) {
    return this.s.listar({ q: (q ?? '').slice(0, 200), setor: '' });
  }

  @EquipeTI() @Get()
  listar(@Query() q: Record<string, string>) {
    return this.s.listar({ q: (q.q ?? '').slice(0, 200), setor: q.setor ?? '' });
  }

  @Permissao('usuarios') @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(ramalSchema)) b: RamalEntrada) { return this.s.criar(u, b); }

  @Permissao('usuarios') @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ramalSchema)) b: RamalEntrada) { return this.s.editar(u, id, b); }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }
}
