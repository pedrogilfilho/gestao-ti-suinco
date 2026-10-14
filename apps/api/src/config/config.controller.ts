import { Body, Controller, Get, Patch } from '@nestjs/common';
import { configNucleoSchema, type ConfigNucleo } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { Permissao, UsuarioAtual, type Usuario } from '../auth/decorators';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
  constructor(private s: ConfigService) {}

  // qualquer pessoa logada lê: as telas precisam das finalidades, acessórios e tipos emprestáveis
  @Get() ler() { return this.s.ler(); }

  @Permissao('config') @Patch()
  salvar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(configNucleoSchema.partial())) b: Partial<ConfigNucleo>) {
    return this.s.salvar(u, b);
  }
}
