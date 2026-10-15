import { Controller, Get } from '@nestjs/common';
import { EquipeTI, UsuarioAtual, type Usuario } from '../auth/decorators';
import { ErroNegocio } from '../comum/erros';
import { AlertasService } from './alertas.service';

@Controller('alertas')
export class AlertasController {
  constructor(private s: AlertasService) {}

  @EquipeTI() @Get()
  listar(@UsuarioAtual() u: Usuario) {
    if (!u.permissoes.has('reservar') && !u.permissoes.has('emprestar')) throw new ErroNegocio(403, 'Você não tem permissão para isso.');
    return this.s.listar();
  }
}
