import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { permissoesEfetivas, ehEquipeTI, type Permissao as P } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { ErroNegocio } from '../comum/erros';
import { ehDono } from './senha';
import { COOKIE, opcoesCookie } from './cookie';
import { PUBLICO, PERMISSAO, EQUIPE, LIVRE_TROCA, type Usuario } from './decorators';

export type UsuarioSessao = Usuario & { trocarSenha: boolean; iat: number };
const UMA_HORA_S = 3600;

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private db: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = <T>(k: string) => this.reflector.getAllAndOverride<T>(k, [ctx.getHandler(), ctx.getClass()]);
    if (meta<boolean>(PUBLICO)) return true;
    const req = ctx.switchToHttp().getRequest();
    const usuario = await this.carregar(req.cookies?.[COOKIE]);
    req.usuario = usuario;
    // renova o cookie quando o token já tem mais de 1 hora, para quem está usando não cair no meio do dia
    if (Date.now() / 1000 - usuario.iat > UMA_HORA_S) {
      const res = ctx.switchToHttp().getResponse<Response>();
      res.cookie(COOKIE, await this.jwt.signAsync({ sub: usuario.acessoId }), opcoesCookie());
    }
    if (usuario.trocarSenha && !meta<boolean>(LIVRE_TROCA)) throw new ErroNegocio(403, 'Troque sua senha para continuar.');
    if (meta<boolean>(EQUIPE) && !usuario.equipeTI) throw new ErroNegocio(403, 'Você não tem permissão para ver isso.');
    const p = meta<P>(PERMISSAO);
    if (p && !usuario.permissoes.has(p)) throw new ErroNegocio(403, 'Você não tem permissão para fazer isso.');
    return true;
  }

  // Relê o acesso no banco a cada requisição: suspensão, logout forçado e mudança de permissão valem na hora.
  async carregar(token: string | undefined): Promise<UsuarioSessao> {
    if (!token) throw new ErroNegocio(401, 'Entre no sistema para continuar.');
    let dados: { sub: string; iat: number };
    try {
      dados = await this.jwt.verifyAsync(token);
    } catch {
      throw new ErroNegocio(401, 'Sua sessão expirou. Entre de novo.');
    }
    const a = await this.db.acesso.findUnique({ where: { id: dados.sub }, include: { pessoa: true, grupo: true, credencial: true } });
    if (!a || a.pessoa.excluidoEm) throw new ErroNegocio(401, 'Entre no sistema para continuar.');
    if (a.suspenso) throw new ErroNegocio(401, 'Seu acesso está suspenso. Fale com a TI.');
    if (a.revogadoEm && a.revogadoEm.getTime() > dados.iat * 1000) throw new ErroNegocio(401, 'Sua sessão foi encerrada pela TI. Entre de novo.');
    const dono = ehDono(a.pessoa.email);
    return {
      acessoId: a.id, pessoaId: a.pessoaId, email: a.pessoa.email, nome: a.pessoa.nome, papel: a.papel, dono,
      permissoes: permissoesEfetivas({ papel: a.papel, dono, permissoes: a.permissoes as never, grupo: a.grupo ? { permissoes: a.grupo.permissoes as never } : null }),
      equipeTI: ehEquipeTI(a.papel, dono),
      trocarSenha: a.credencial?.trocarNoProximoLogin ?? false,
      iat: dados.iat,
    };
  }
}
