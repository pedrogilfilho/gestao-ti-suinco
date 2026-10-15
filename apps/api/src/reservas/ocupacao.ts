import { diaSP, horaSP, situacaoEquipamento, type ConfigNucleo } from '@gestao/shared';
import type { Equipamento } from '@prisma/client';
import type { PrismaService, Tx } from '../comum/prisma.service';

type Db = PrismaService | Tx;
const dataBR = (d: Date) => diaSP(d).split('-').reverse().join('/');
const diaMes = (d: Date) => dataBR(d).slice(0, 5);

// Reserva ativa do equipamento que invade [a, b) — intervalos semiabertos: terminar quando a outra começa não é conflito.
export function reservaNoPeriodo(db: Db, equipamentoId: string, a: Date, b: Date, opts: { ignorarReserva?: string; ignorarPessoa?: string } = {}) {
  return db.reserva.findFirst({
    where: {
      equipamentoId, status: 'ativa', excluidoEm: null, inicioEm: { lt: b }, fimEm: { gt: a },
      ...(opts.ignorarReserva && { id: { not: opts.ignorarReserva } }),
      ...(opts.ignorarPessoa && { pessoaId: { not: opts.ignorarPessoa } }),
    },
    include: { pessoa: { select: { nome: true } } },
    orderBy: { inicioEm: 'asc' },
  });
}

// "das 08:00 às 12:00", com o dia quando a reserva não é no dia do período pedido
export const horarioReserva = (r: { inicioEm: Date; fimEm: Date }, a?: Date) =>
  `${a && diaSP(r.inicioEm) !== diaSP(a) ? `em ${diaMes(r.inicioEm)} ` : ''}das ${horaSP(r.inicioEm)} às ${horaSP(r.fimEm)}`;

// Por que o equipamento não pode ser usado em [a, b) ("null" = livre). Spec 3.1.
export async function motivoOcupado(
  db: Db, eq: Pick<Equipamento, 'id' | 'situacao' | 'somenteCadastro' | 'pessoaId' | 'vinculoLivre'>, a: Date, b: Date,
  opts: { ignorarReserva?: string; ignorarPessoa?: string } = {},
): Promise<string | null> {
  const sit = situacaoEquipamento({ ...eq, vinculoLivre: eq.vinculoLivre || null }, false);
  if (sit.k !== 'livre') return sit.txt;
  const r = await reservaNoPeriodo(db, eq.id, a, b, opts);
  if (r) return `Indisponível: já reservado por ${r.pessoa.nome} ${horarioReserva(r, a)}`;
  const e = await db.emprestimo.findFirst({
    where: { equipamentoId: eq.id, devolvidoEm: null, excluidoEm: null, OR: [{ previsaoEm: null }, { previsaoEm: { gt: a } }] },
    include: { pessoa: { select: { nome: true } } },
  });
  if (e) return `Indisponível: emprestado a ${e.pessoa.nome} até ${e.previsaoEm ? `${dataBR(e.previsaoEm)} ${horaSP(e.previsaoEm)}` : 'sem previsão'}`;
  return null;
}

// Equipamentos de empréstimo com o motivo de ocupação de cada um no período (para as listas das telas).
export async function ocupacaoDosEmprestaveis(db: Db, cfg: ConfigNucleo, a: Date, b: Date, ignorarReserva?: string) {
  const eqs = await db.equipamento.findMany({
    where: { excluidoEm: null, tipo: { in: cfg.tiposEmprestaveis }, situacao: { not: 'baixado' }, somenteCadastro: false, pessoaId: null, vinculoLivre: '' },
    orderBy: { codigo: 'asc' },
  });
  return Promise.all(eqs.map(async (e) => ({
    id: e.id, codigo: e.codigo, tipo: e.tipo, modelo: e.modelo, motivo: await motivoOcupado(db, e, a, b, { ignorarReserva }),
  })));
}

// Quantos equipamentos do tipo a pessoa tem ao mesmo tempo em [a, b): empréstimos abertos + reservas ativas sobrepostas.
// A reserva do próprio equipamento que está sendo emprestado não conta (é a mesma coisa).
export async function contarPosse(db: Db, pessoaId: string, tipo: string, a: Date, b: Date, ignorar: { reserva?: string; equipamento?: string; emprestimo?: string } = {}) {
  const [emps, ress] = await Promise.all([
    db.emprestimo.count({ where: { pessoaId, devolvidoEm: null, excluidoEm: null, equipamento: { tipo }, ...(ignorar.emprestimo && { id: { not: ignorar.emprestimo } }) } }),
    db.reserva.count({
      where: {
        pessoaId, status: 'ativa', excluidoEm: null, equipamento: { tipo }, inicioEm: { lt: b }, fimEm: { gt: a },
        ...(ignorar.reserva && { id: { not: ignorar.reserva } }),
        ...(ignorar.equipamento && { equipamentoId: { not: ignorar.equipamento } }),
      },
    }),
  ]);
  return emps + ress;
}
