import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

export type CodigoErro = 'limite' | 'atraso';

export class ErroNegocio extends HttpException {
  constructor(status: 400 | 401 | 403 | 404 | 409 | 429, mensagem: string, campo?: string, codigo?: CodigoErro) {
    super({ mensagem, campo, codigo }, status);
    this.message = mensagem;
  }
  get mensagem(): string { return (this.getResponse() as { mensagem: string }).mensagem; }
}

@Catch()
export class FiltroErros implements ExceptionFilter {
  private log = new Logger('Erros');

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) {
      const corpo = e.getResponse();
      const msg = typeof corpo === 'object' && corpo && 'mensagem' in corpo
        ? corpo
        : { mensagem: e.getStatus() === 404 ? 'Não encontrado.' : e.getStatus() === 403 ? 'Você não tem permissão para fazer isso.' : e.message };
      return res.status(e.getStatus()).json(msg);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return res.status(409).json({ mensagem: 'Já existe um cadastro com esses dados.' });
    this.log.error(e instanceof Error ? e.stack : String(e));
    return res.status(500).json({ mensagem: 'Erro inesperado. Tente de novo; se continuar, avise a TI.' });
  }
}
