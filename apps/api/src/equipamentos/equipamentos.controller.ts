import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { equipamentoSchema, equipamentosLoteSchema, type EquipamentoEntrada } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { parametrosLista } from '../comum/lista';
import { EquipeTI, Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { EquipamentosService } from './equipamentos.service';
import { ErroNegocio } from '../comum/erros';

const vincularSchema = z.object({ pessoaId: z.string().uuid('Escolha um colaborador cadastrado.').nullable() });

@Controller('equipamentos')
export class EquipamentosController {
  constructor(private s: EquipamentosService) {}

  @EquipeTI() @Get()
  listar(@Query() q: Record<string, string>) {
    return this.s.listar({ ...parametrosLista(q), tipo: q.tipo, situacao: q.situacao, setorId: q.setorId, pessoaId: q.pessoaId });
  }

  // módulo 2: emprestáveis com o motivo de ocupação no período (listas de reserva, aprovação e empréstimo)
  @EquipeTI() @Get('ocupacao')
  ocupacao(@UsuarioAtual() u: Usuario, @Query() q: Record<string, string>) {
    if (!u.permissoes.has('reservar') && !u.permissoes.has('emprestar')) throw new ErroNegocio(403, 'Você não tem permissão para isso.');
    const a = new Date(q.inicio ?? ''), b = new Date(q.fim ?? '');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) throw new ErroNegocio(400, 'Período inválido.');
    return this.s.ocupacao(a, b, q.ignorarReserva || undefined);
  }

  @Permissao('emprestar') @Get('livres')
  livres() { return this.s.livresParaEmprestimo(); }

  @Permissao('equipamentos') @Post('lote') @HttpCode(200)
  lote(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(equipamentosLoteSchema)) b: { linhas: unknown[] }) { return this.s.lote(u, b.linhas); }

  @EquipeTI() @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) { return this.s.obter(id); }

  @Permissao('equipamentos') @Post()
  criar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(equipamentoSchema)) b: EquipamentoEntrada) { return this.s.criar(u, b); }

  @Permissao('equipamentos') @Patch(':id')
  editar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(equipamentoSchema)) b: EquipamentoEntrada) {
    return this.s.editar(u, id, b);
  }

  @Permissao('equipamentos') @Post(':id/vincular') @HttpCode(200)
  vincular(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(vincularSchema)) b: { pessoaId: string | null }) {
    return this.s.vincular(u, id, b.pessoaId);
  }

  @Permissao('excluir') @Delete(':id') @HttpCode(200)
  excluir(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.excluir(u, id); }
}
