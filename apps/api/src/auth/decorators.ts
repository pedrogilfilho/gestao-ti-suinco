import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Papel, Permissao as P } from '@gestao/shared';

export interface Usuario {
  acessoId: string; pessoaId: string; email: string; nome: string;
  papel: Papel; dono: boolean; permissoes: Set<P>; equipeTI: boolean;
}

export const PUBLICO = 'publico', PERMISSAO = 'permissao', EQUIPE = 'equipe', LIVRE_TROCA = 'livreTroca';
export const Publico = () => SetMetadata(PUBLICO, true);
export const Permissao = (p: P) => SetMetadata(PERMISSAO, p);
export const EquipeTI = () => SetMetadata(EQUIPE, true);
export const LiberadoNaTrocaDeSenha = () => SetMetadata(LIVRE_TROCA, true);
export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Usuario => ctx.switchToHttp().getRequest().usuario);
