import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  pessoaSchema, pessoaEdicaoSchema, pessoasLoteSchema, desativarSchema, minhaFotoSchema,
  type PessoaEntrada, type PessoaEdicao,
} from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { parametrosLista } from '../comum/lista';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { enviarArquivo } from '../comum/arquivos.service';
import { PessoasService } from './pessoas.service';

@Controller('pessoas')
export class PessoasController {
  constructor(private s: PessoasService) {}

  @EquipeTI() @Get()
  listar(@Query() q: Record<string, string>) {
    return this.s.listar({ ...parametrosLista(q), setorId: q.setorId, ativo: q.ativo });
  }

  // qualquer pessoa logada troca a própria foto ("Minha foto")
  @Post('minha-foto') @HttpCode(200)
  minhaFoto(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(minhaFotoSchema)) b: { foto?: string; apagarFoto?: boolean }) {
    return this.s.minhaFoto(u, b);
  }

  @Permissao('usuarios') @Post('lote') @HttpCode(200)
  lote(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(pessoasLoteSchema)) b: { linhas: unknown[] }) { return this.s.lote(u, b.linhas); }

  @Permissao('usuarios') @Post('desativar') @HttpCode(200)
  desativar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(desativarSchema)) b: { ids: string[] }) { return this.s.desativar(u, b.ids); }

  @EquipeTI() @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) { return this.s.obter(id); }

  @Get(':id/foto')
  async foto(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    enviarArquivo(res, await this.s.caminhoFoto(u, id));
  }

  @EquipeTI() @Get(':id/assinatura')
  async assinatura(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    enviarArquivo(res, await this.s.caminhoAssinatura(id));
  }

  @Permissao('usuarios') @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(pessoaSchema)) b: PessoaEntrada) { return this.s.criar(u, b); }

  @Permissao('usuarios') @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(pessoaEdicaoSchema)) b: PessoaEdicao) {
    return this.s.editar(u, id, b);
  }

  @Permissao('usuarios') @Post(':id/reativar') @HttpCode(200)
  reativar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.reativar(u, id); }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }
}
