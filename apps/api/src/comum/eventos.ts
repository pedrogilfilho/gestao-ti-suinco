import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type AreaEvento = 'emprestimos' | 'equipamentos' | 'pessoas' | 'setores' | 'acessos' | 'config' | 'reservas' | 'pedidos' | 'termos';
export type Eventos = {
  'acesso.derrubado': { acessoId: string };
  mudou: { area: AreaEvento; pessoaIds?: string[] };
  // mensagem nova do colaborador num pedido (a TI busca a conversa pela API)
  mensagem: { pedidoId: string };
};

// Avisos internos (depois de a transação confirmar); o gateway de tempo real repassa para as telas.
@Injectable()
export class EventosService {
  private em = new EventEmitter();
  emitir<K extends keyof Eventos>(nome: K, dados: Eventos[K]) { this.em.emit(nome, dados); }
  on<K extends keyof Eventos>(nome: K, fn: (d: Eventos[K]) => void) { this.em.on(nome, fn); }
}
