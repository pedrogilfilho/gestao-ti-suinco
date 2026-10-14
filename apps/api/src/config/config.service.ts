import { Injectable } from '@nestjs/common';
import { configNucleoSchema, type ConfigNucleo } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { EventosService } from '../comum/eventos';
import { auditar } from '../comum/auditar';
import { lerConfig } from '../comum/config-ler';
import type { Usuario } from '../auth/decorators';

@Injectable()
export class ConfigService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  ler(): Promise<ConfigNucleo> { return lerConfig(this.db); }

  async salvar(u: Usuario, parcial: Partial<ConfigNucleo>) {
    const antes = await this.ler();
    const mudou = Object.fromEntries(Object.entries(parcial).filter(([, v]) => v !== undefined));
    const depois = configNucleoSchema.parse({ ...antes, ...mudou });
    await this.db.$transaction(async (tx) => {
      await tx.config.upsert({ where: { chave: 'nucleo' }, create: { chave: 'nucleo', valor: depois }, update: { valor: depois } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'config', itemId: 'nucleo', antes, depois });
    });
    this.eventos.emitir('mudou', { area: 'config' });
    return depois;
  }
}
