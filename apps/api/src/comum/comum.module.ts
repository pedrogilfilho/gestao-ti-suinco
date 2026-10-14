import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ArquivosService } from './arquivos.service';
import { EventosService } from './eventos';

@Global()
@Module({
  providers: [PrismaService, EventosService, { provide: ArquivosService, useFactory: () => new ArquivosService() }],
  exports: [PrismaService, EventosService, ArquivosService],
})
export class ComumModule {}
