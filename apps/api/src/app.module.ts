import { Module } from '@nestjs/common';
import { ComumModule } from './comum/comum.module';
import { AuthModule } from './auth/auth.module';
import { SetoresModule } from './setores/setores.module';
import { PessoasModule } from './pessoas/pessoas.module';

@Module({ imports: [ComumModule, AuthModule, SetoresModule, PessoasModule] })
export class AppModule {}
