import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  emprestimoNovoSchema, emprestimoEdicaoSchema, devolucaoSchema, resolverSchema,
  type EmprestimoNovo, type EmprestimoEdicao, type Devolucao, type Resolver,
} from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { parametrosLista } from '../comum/lista';
import { ErroNegocio } from '../comum/erros';
import { enviarArquivo } from '../comum/arquivos.service';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { EmprestimosService, type StatusLista } from './emprestimos.service';

const STATUS: StatusLista[] = ['abertos', 'atrasados', 'devolvidos', 'pendencias', 'todos'];

@Controller()
export class EmprestimosController {
  constructor(private s: EmprestimosService) {}

  @EquipeTI() @Get('emprestimos')
  listar(@Query() q: Record<string, string>) {
    const status = STATUS.includes(q.status as StatusLista) ? (q.status as StatusLista) : 'abertos';
    return this.s.listar({ ...parametrosLista(q), status, pessoaId: q.pessoaId });
  }

  @EquipeTI() @Get('emprestimos/:id')
  obter(@Param('id', ParseUUIDPipe) id: string) { return this.s.obter(id); }

  @Get('emprestimos/:id/assinatura/:qual')
  async assinatura(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Param('qual') qual: string, @Res() res: Response) {
    if (qual !== 'retirada' && qual !== 'devolucao') throw new ErroNegocio(404, 'Não encontrado.');
    enviarArquivo(res, await this.s.caminhoAssinatura(u, id, qual));
  }

  @Permissao('emprestar') @Post('emprestimos')
  registrar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(emprestimoNovoSchema)) b: EmprestimoNovo) { return this.s.registrar(u, b); }

  @Permissao('emprestar') @Patch('emprestimos/:id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(emprestimoEdicaoSchema)) b: EmprestimoEdicao) {
    return this.s.editar(u, id, b);
  }

  @Permissao('emprestar') @Post('emprestimos/:id/devolver') @HttpCode(200)
  devolver(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(devolucaoSchema)) b: Devolucao) {
    return this.s.devolver(u, id, b);
  }

  @Permissao('emprestar') @Post('emprestimos/:id/resolver') @HttpCode(200)
  resolver(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(resolverSchema)) b: Resolver) {
    return this.s.resolver(u, id, b);
  }

  @Permissao('excluir') @Delete('emprestimos/:id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }

  @Get('meus-emprestimos')
  meus(@UsuarioAtual() u: Usuario) { return this.s.meus(u); }

  @EquipeTI() @Get('contadores')
  contadores() { return this.s.contadores(); }
}
