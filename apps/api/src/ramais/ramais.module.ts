import { Module } from '@nestjs/common';
import { RamaisController } from './ramais.controller';
import { RamaisService } from './ramais.service';

@Module({ controllers: [RamaisController], providers: [RamaisService] })
export class RamaisModule {}
