import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { parse } from 'cookie';
import { JwtGuard } from '../auth/jwt.guard';
import { COOKIE } from '../auth/cookie';
import { EventosService } from '../comum/eventos';

// Avisa as telas que algo mudou. O aviso não leva dados: a tela busca de novo pela API,
// que confere as permissões. Salas: "equipe" (TI), "pessoa:<id>" e "acesso:<id>".
@WebSocketGateway({ path: '/socket.io' })
export class TempoRealGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;

  constructor(private guard: JwtGuard, private eventos: EventosService) {}

  afterInit(server: Server) {
    // só entra quem tem login válido (mesma checagem das rotas da API)
    server.use(async (s: Socket, next) => {
      try {
        const u = await this.guard.carregar(parse(s.handshake.headers.cookie ?? '')[COOKIE]);
        await s.join([`acesso:${u.acessoId}`, `pessoa:${u.pessoaId}`, ...(u.equipeTI ? ['equipe'] : [])]);
        next();
      } catch {
        next(new Error('Entre no sistema para continuar.'));
      }
    });

    this.eventos.on('mudou', ({ area, pessoaIds }) => {
      server.to(['equipe', ...(pessoaIds ?? []).map((id) => `pessoa:${id}`)]).emit('mudou', { area });
    });

    this.eventos.on('acesso.derrubado', async ({ acessoId }) => {
      const socks = await server.in(`acesso:${acessoId}`).fetchSockets();
      for (const s of socks) {
        s.emit('sair', { motivo: 'Sua sessão foi encerrada pela TI.' });
        s.disconnect(true);
      }
    });
  }
}
