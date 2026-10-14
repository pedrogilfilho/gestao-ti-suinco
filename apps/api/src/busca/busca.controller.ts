import { Controller, Get, Query } from '@nestjs/common';
import { EquipeTI } from '../auth/decorators';
import { BuscaService } from './busca.service';

@Controller('busca')
export class BuscaController {
  constructor(private s: BuscaService) {}

  @EquipeTI() @Get()
  buscar(@Query('q') q = '') { return this.s.buscar(q); }
}
