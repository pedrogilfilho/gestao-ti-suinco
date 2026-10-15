import { Module } from '@nestjs/common';
import { ComumModule } from './comum/comum.module';
import { AuthModule } from './auth/auth.module';
import { SetoresModule } from './setores/setores.module';
import { PessoasModule } from './pessoas/pessoas.module';
import { EquipamentosModule } from './equipamentos/equipamentos.module';
import { AcessosModule } from './acessos/acessos.module';
import { EmprestimosModule } from './emprestimos/emprestimos.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ConfigModule } from './config/config.module';
import { ReservasModule } from './reservas/reservas.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { BuscaModule } from './busca/busca.module';
import { TempoRealModule } from './tempo-real/tempo-real.module';
import { RamaisModule } from './ramais/ramais.module';

@Module({
  imports: [
    ComumModule, AuthModule, SetoresModule, PessoasModule, EquipamentosModule,
    AcessosModule, EmprestimosModule, AuditoriaModule, ConfigModule, BuscaModule, ReservasModule, PedidosModule, RamaisModule, TempoRealModule,
  ],
})
export class AppModule {}
