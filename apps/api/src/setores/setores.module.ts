import { Module } from '@nestjs/common';
import { SetoresController } from './setores.controller';
import { SetoresService } from './setores.service';

@Module({ controllers: [SetoresController], providers: [SetoresService], exports: [SetoresService] })
export class SetoresModule {}
