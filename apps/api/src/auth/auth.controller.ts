import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { loginSchema, trocarSenhaSchema, type LoginEntrada, type TrocarSenha } from '@gestao/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { AuthService } from './auth.service';
import { COOKIE, opcoesCookie } from './cookie';
import type { UsuarioSessao } from './jwt.guard';
import { Publico, UsuarioAtual, LiberadoNaTrocaDeSenha, type Usuario } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Publico() @Post('login') @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) b: LoginEntrada, @Res({ passthrough: true }) res: Response) {
    res.cookie(COOKIE, await this.auth.login(b), opcoesCookie());
    return { ok: true };
  }

  @Publico() @Post('logout') @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }

  @LiberadoNaTrocaDeSenha() @Get('eu')
  eu(@UsuarioAtual() u: UsuarioSessao) {
    return {
      nome: u.nome, email: u.email, pessoaId: u.pessoaId, papel: u.papel, dono: u.dono,
      permissoes: [...u.permissoes].sort(), equipeTI: u.equipeTI, trocarSenha: u.trocarSenha,
    };
  }

  @LiberadoNaTrocaDeSenha() @Post('trocar-senha') @HttpCode(200)
  async trocar(@UsuarioAtual() u: Usuario, @Body(new ZodPipe(trocarSenhaSchema)) b: TrocarSenha) {
    await this.auth.trocarSenha(u.acessoId, b);
    return { ok: true };
  }
}
