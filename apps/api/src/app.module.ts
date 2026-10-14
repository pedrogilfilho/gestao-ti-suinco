import { Module } from '@nestjs/common';
import { ComumModule } from './comum/comum.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [ComumModule, AuthModule] })
export class AppModule {}
