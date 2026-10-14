import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { acessoNovoSchema, acessoEdicaoSchema, grupoSchema, type AcessoNovo, type AcessoEdicao, type GrupoEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { AcessosService } from './acessos.service';

@Permissao('acessos')
@Controller('acessos')
export class AcessosController {
  constructor(private s: AcessosService) {}

  @Get() listar() { return this.s.listar(); }

  @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(acessoNovoSchema)) b: AcessoNovo) { return this.s.criar(u, b); }

  @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(acessoEdicaoSchema)) b: AcessoEdicao) {
    return this.s.editar(u, id, b);
  }

  @Post(':id/suspender') @HttpCode(200)
  suspender(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.suspender(u, id, true); }

  @Post(':id/reativar') @HttpCode(200)
  reativar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.suspender(u, id, false); }

  @Post(':id/forcar-logout') @HttpCode(200)
  forcarLogout(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.forcarLogout(u, id); }

  @Post(':id/senha-temporaria') @HttpCode(200)
  senha(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.senhaTemporaria(u, id); }

  @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }
}

@Permissao('acessos')
@Controller('grupos')
export class GruposController {
  constructor(private s: AcessosService) {}

  @Get() listar() { return this.s.listarGrupos(); }

  @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(grupoSchema)) b: GrupoEntrada) { return this.s.criarGrupo(u, b); }

  @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(grupoSchema)) b: GrupoEntrada) {
    return this.s.editarGrupo(u, id, b);
  }

  @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluirGrupo(u, id); }
}
