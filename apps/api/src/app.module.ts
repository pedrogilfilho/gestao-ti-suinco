import { Module } from '@nestjs/common';
import { ComumModule } from './comum/comum.module';

@Module({ imports: [ComumModule] })
export class AppModule {}
