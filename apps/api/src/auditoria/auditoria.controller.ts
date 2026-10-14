import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { parametrosLista } from '../comum/lista';
import { Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
export class AuditoriaController {
  constructor(private s: AuditoriaService) {}

  @Permissao('auditoria') @Get()
  listar(@Query() q: Record<string, string>) {
    return this.s.listar({ ...parametrosLista(q), area: q.area, acao: q.acao, atorId: q.atorId, itemId: q.itemId, de: q.de, ate: q.ate });
  }

  // Restaurar é do Administrador Master (mesma permissão de excluir)
  @Permissao('excluir') @Post(':id/restaurar') @HttpCode(200)
  restaurar(@UsuarioAtual() u: Usuario, @Param('id', ParseUUIDPipe) id: string) { return this.s.restaurar(u, id); }
}
