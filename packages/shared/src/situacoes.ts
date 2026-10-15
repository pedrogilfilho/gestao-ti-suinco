import type { SituacaoEquip, StatusReserva } from './constantes.js';
import { diaSP, horaSP, diasEntre } from './datas.js';

export type Situacao = { k: string; txt: string; cls: 'ok' | 'out' | 'warn' | 'late' };
export interface EquipParaSituacao { situacao: SituacaoEquip; somenteCadastro: boolean; pessoaId: string | null; vinculoLivre: string | null }
export interface EmpParaSituacao {
  devolvidoEm: Date | null; acessoriosFaltando: string[]; assinaturaDevolucaoUrl: string | null; previsaoEm: Date | null;
}

const GRAVADAS: Partial<Record<SituacaoEquip, Situacao>> = {
  baixado: { k: 'baixado', txt: 'Baixado', cls: 'late' },
  danificado: { k: 'danificado', txt: 'Danificado', cls: 'late' },
  extraviado: { k: 'extraviado', txt: 'Extraviado', cls: 'late' },
  manutencao: { k: 'manut', txt: 'Em manutenção', cls: 'warn' },
};

export function situacaoEquipamento(eq: EquipParaSituacao, emprestado: boolean): Situacao {
  const g = GRAVADAS[eq.situacao];
  if (g) return g;
  if (eq.pessoaId || eq.vinculoLivre) return { k: 'atrib', txt: 'Vinculado', cls: 'out' };
  if (eq.somenteCadastro) return { k: 'estoque', txt: 'Em estoque', cls: 'ok' };
  return emprestado ? { k: 'fora', txt: 'Emprestado', cls: 'out' } : { k: 'livre', txt: 'Disponível', cls: 'ok' };
}

export function situacaoEmprestimo(e: EmpParaSituacao, agora: Date, assinaturasLigadas: boolean): Situacao {
  if (e.devolvidoEm) {
    if (e.acessoriosFaltando.length) return { k: 'dev', txt: 'Devolvido com pendência', cls: 'warn' };
    if (assinaturasLigadas && !e.assinaturaDevolucaoUrl) return { k: 'dev', txt: 'Devolvido sem assinatura', cls: 'warn' };
    return { k: 'dev', txt: 'Devolvido', cls: 'ok' };
  }
  if (!e.previsaoEm) return { k: 'aberto', txt: 'Sem previsão de entrega', cls: 'warn' };
  if (e.previsaoEm < agora) {
    const d = diasEntre(diaSP(e.previsaoEm), diaSP(agora));
    return { k: 'late', txt: d > 0 ? `Atrasado ${d} dia${d === 1 ? '' : 's'}` : 'Atrasado hoje', cls: 'late' };
  }
  if (diaSP(e.previsaoEm) === diaSP(agora)) return { k: 'aberto', txt: `Vence hoje às ${horaSP(e.previsaoEm)}`, cls: 'warn' };
  return { k: 'aberto', txt: 'Emprestado', cls: 'out' };
}

// Reserva: some de "Próximas" quando passa o dia (de Brasília) da retirada sem registrar a retirada.
export function situacaoReserva(r: { status: StatusReserva; inicioEm: Date }, agora: Date): Situacao {
  if (r.status === 'retirada') return { k: 'retirada', txt: 'Retirada (empréstimo)', cls: 'ok' };
  if (r.status === 'cancelada') return { k: 'cancelada', txt: 'Cancelada', cls: 'late' };
  const hoje = diaSP(agora), dia = diaSP(r.inicioEm);
  if (hoje > dia) return { k: 'naoret', txt: 'Não retirada', cls: 'warn' };
  if (hoje === dia) return { k: 'hoje', txt: 'Hoje', cls: 'warn' };
  return { k: 'reservada', txt: 'Reservada', cls: 'out' };
}
