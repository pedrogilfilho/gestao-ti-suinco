import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginEntrada, TrocarSenha } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { ErroNegocio } from '../comum/erros';
import { auditar } from '../comum/auditar';
import { confere, gerarHash } from './senha';

const MAX_ERROS = 5, TRAVA_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService) {}

  async login({ email, senha }: LoginEntrada): Promise<string> {
    const t = await this.db.tentativaLogin.findUnique({ where: { email } });
    if (t?.travadoAte && t.travadoAte > new Date()) throw new ErroNegocio(429, 'Muitas tentativas erradas. Tente de novo em 15 minutos.');
    const p = await this.db.pessoa.findFirst({ where: { email, excluidoEm: null }, include: { acesso: { include: { credencial: true } } } });
    const acesso = p?.acesso, cred = acesso?.credencial;
    if (!acesso || !cred || !(await confere(cred.senhaHash, senha))) {
      const erros = (t?.erros ?? 0) + 1, trava = erros >= MAX_ERROS;
      const dados = { erros: trava ? 0 : erros, travadoAte: trava ? new Date(Date.now() + TRAVA_MS) : null };
      await this.db.tentativaLogin.upsert({ where: { email }, create: { email, ...dados }, update: dados });
      throw new ErroNegocio(401, 'E-mail ou senha incorretos.');
    }
    if (acesso.suspenso) throw new ErroNegocio(401, 'Seu acesso está suspenso. Fale com a TI.');
    await this.db.$transaction(async (tx) => {
      await tx.tentativaLogin.deleteMany({ where: { email } });
      await tx.acesso.update({ where: { id: acesso.id }, data: { ultimoLoginEm: new Date() } });
      await auditar(tx, { atorId: acesso.id, acao: 'login', area: 'auth', itemId: acesso.id });
    });
    return this.jwt.signAsync({ sub: acesso.id, t: Date.now() });
  }

  async trocarSenha(acessoId: string, { atual, nova }: TrocarSenha) {
    const c = await this.db.credencialLocal.findUnique({ where: { acessoId } });
    if (!c || !(await confere(c.senhaHash, atual))) throw new ErroNegocio(400, 'A senha atual não confere.', 'atual');
    if (atual === nova) throw new ErroNegocio(400, 'A nova senha precisa ser diferente da atual.', 'nova');
    const senhaHash = await gerarHash(nova);
    await this.db.$transaction(async (tx) => {
      await tx.credencialLocal.update({ where: { acessoId }, data: { senhaHash, trocarNoProximoLogin: false } });
      await auditar(tx, { atorId: acessoId, acao: 'senha', area: 'auth', itemId: acessoId });
    });
  }
}
