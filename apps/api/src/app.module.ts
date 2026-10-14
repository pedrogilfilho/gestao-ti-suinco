import { Module } from '@nestjs/common';
import { ComumModule } from './comum/comum.module';
import { AuthModule } from './auth/auth.module';
import { SetoresModule } from './setores/setores.module';
import { PessoasModule } from './pessoas/pessoas.module';
import { EquipamentosModule } from './equipamentos/equipamentos.module';

@Module({ imports: [ComumModule, AuthModule, SetoresModule, PessoasModule, EquipamentosModule] })
export class AppModule {}
