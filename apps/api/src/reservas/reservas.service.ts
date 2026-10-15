import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { diaSP, limiteDe, situacaoReserva, type ReservaEdicao, type ReservaEntrada } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import { lerConfig } from '../comum/config-ler';
import { paginar, termos } from '../comum/lista';
import type { Usuario } from '../auth/decorators';
import { contarPosse, horarioReserva, motivoOcupado, reservaNoPeriodo } from './ocupacao';

export type StatusListaReserva = 'proximas' | 'hoje' | 'historico' | 'todas';

const INCLUIR = {
  equipamento: { select: { id: true, codigo: true, tipo: true, modelo: true } },
  pessoa: { select: { id: true, nome: true, email: true, telefoneCorp: true, telefonePart: true, setor: { select: { nome: true } } } },
  emprestimo: { select: { id: true } },
} satisfies Prisma.ReservaInclude;
type ReservaCompleta = Prisma.ReservaGetPayload<{ include: typeof INCLUIR }>;

// meia-noite de Brasília do dia de `d` (+ n dias)
const inicioDoDia = (d: Date, n = 0) => new Date(Date.parse(`${diaSP(d)}T00:00:00-03:00`) + n * 86_400_000);

@Injectable()
export class ReservasService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  private paraTela(r: ReservaCompleta, agora = new Date()) {
    const { emprestimo, ...resto } = r;
    return { ...resto, pessoa: { ...r.pessoa, setor: r.pessoa.setor.nome }, emprestimoId: emprestimo?.id ?? null, situacao: situacaoReserva(r, agora) };
  }

  private filtro(status: StatusListaReserva, agora: Date): Prisma.ReservaWhereInput {
    const hoje = inicioDoDia(agora), amanha = inicioDoDia(agora, 1);
    if (status === 'proximas') return { status: 'ativa', inicioEm: { gte: hoje } };
    if (status === 'hoje') return { status: 'ativa', inicioEm: { gte: hoje, lt: amanha } };
    if (status === 'historico') return { OR: [{ status: { not: 'ativa' } }, { inicioEm: { lt: hoje } }] };
    return {};
  }

  async listar(f: { status: StatusListaReserva; q: string; cursor?: string; limite: number }) {
    const agora = new Date();
    const porTermo = termos(f.q).map((t): Prisma.ReservaWhereInput => ({
      OR: [
        { equipamento: { codigo: { contains: t, mode: 'insensitive' } } }, { pessoa: { nome: { contains: t, mode: 'insensitive' } } },
        { pessoa: { email: { contains: t, mode: 'insensitive' } } }, { pessoa: { setor: { nome: { contains: t, mode: 'insensitive' } } } },
        { finalidade: { contains: t, mode: 'insensitive' } }, { chamadoGlpi: { contains: t } },
      ],
    }));
    const futuro = f.status === 'proximas' || f.status === 'hoje';
    const itens = await this.db.reserva.findMany({
      where: { excluidoEm: null, ...this.filtro(f.status, agora), AND: porTermo },
      include: INCLUIR, orderBy: [{ inicioEm: futuro ? 'asc' : 'desc' }, { id: 'asc' }],
      take: f.limite + 1, ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    const pg = paginar(itens, f.limite);
    return { itens: pg.itens.map((r) => this.paraTela(r, agora)), proximo: pg.proximo };
  }

  // Confere pessoa, equipamento, data e horário livre. Atraso e limite só ao criar (como no app atual).
  private async conferir(u: Usuario, d: ReservaEntrada | ReservaEdicao, novo: boolean, ignorar?: string) {
    const cfg = await lerConfig(this.db);
    const pessoa = await this.db.pessoa.findFirst({ where: { id: d.pessoaId, excluidoEm: null } });
    if (!pessoa) throw new ErroNegocio(400, 'Selecione o usuário.', 'pessoaId');
    if (!pessoa.ativo) throw new ErroNegocio(409, `${pessoa.nome} está desativado.`, 'pessoaId');
    const eq = await this.db.equipamento.findFirst({ where: { id: d.equipamentoId, excluidoEm: null } });
    if (!eq) throw new ErroNegocio(400, 'Escolha o equipamento.', 'equipamentoId');
    if (!cfg.tiposEmprestaveis.includes(eq.tipo as never)) throw new ErroNegocio(409, `${eq.codigo} não é um equipamento de empréstimo.`, 'equipamentoId');
    if (diaSP(d.inicioEm) < diaSP(new Date())) throw new ErroNegocio(400, 'A data da reserva já passou.', 'inicioEm');
    const fim = d.devolucaoEm ?? d.fimEm;

    if (novo && cfg.bloqueioAtraso) {
      const atrasados = await this.db.emprestimo.findMany({
        where: { pessoaId: pessoa.id, devolvidoEm: null, excluidoEm: null, previsaoEm: { lt: new Date() } }, include: { equipamento: true },
      });
      if (atrasados.length) {
        if (!('liberarAtraso' in d && d.liberarAtraso))
          throw new ErroNegocio(409, `${pessoa.nome} está com equipamento em atraso (${atrasados.map((a) => a.equipamento.codigo).join(', ')}). Novas reservas ficam bloqueadas até a devolução.`, undefined, 'atraso');
        if (!u.permissoes.has('excluir')) throw new ErroNegocio(403, 'Só o Administrador Master pode liberar essa exceção.');
      }
    }
    if (novo) {
      const lim = limiteDe(pessoa.limites, eq.tipo), tem = await contarPosse(this.db, pessoa.id, eq.tipo, d.inicioEm, fim);
      if (tem >= lim) {
        if (!('liberarLimite' in d && d.liberarLimite))
          throw new ErroNegocio(409, `${pessoa.nome} já está com ${tem} ${eq.tipo} nesse período (limite: ${lim}).`, undefined, 'limite');
        if (!u.permissoes.has('excluir')) throw new ErroNegocio(403, 'Só o Administrador Master pode liberar essa exceção.');
      }
    }
    const outra = await reservaNoPeriodo(this.db, eq.id, d.inicioEm, fim, { ignorarReserva: ignorar });
    if (outra) throw new ErroNegocio(409, `Conflito: ${eq.codigo} já está reservado para ${outra.pessoa.nome} ${horarioReserva(outra, d.inicioEm)}.`, 'equipamentoId', 'conflito');
    const motivo = await motivoOcupado(this.db, eq, d.inicioEm, fim, { ignorarReserva: ignorar });
    if (motivo) throw new ErroNegocio(409, `${eq.codigo}: ${motivo}. Escolha outro equipamento ou horário.`, 'equipamentoId', 'conflito');
    return { pessoa, eq, fim };
  }

  private dados(d: ReservaEntrada | ReservaEdicao, fim: Date) {
    return {
      equipamentoId: d.equipamentoId, pessoaId: d.pessoaId, inicioEm: d.inicioEm, fimEm: fim, finalidade: d.finalidade,
      finalidadeOutra: d.finalidade === 'Outra' ? d.finalidadeOutra : '', chamadoGlpi: d.chamadoGlpi, obs: d.obs,
    };
  }

  async criar(u: Usuario, d: ReservaEntrada) {
    const { pessoa, eq, fim } = await this.conferir(u, d, true);
    const r = await this.db.$transaction(async (tx) => {
      const r = await tx.reserva.create({ data: { ...this.dados(d, fim), criadoPorId: u.pessoaId } });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'reservas', itemId: r.id, depois: { ...r, equipamento: eq.codigo, pessoa: pessoa.nome } });
      return r;
    });
    this.eventos.emitir('mudou', { area: 'reservas' });
    return r;
  }

  private async ativa(id: string) {
    const r = await this.db.reserva.findFirst({ where: { id, excluidoEm: null } });
    if (!r) throw new ErroNegocio(404, 'Reserva não encontrada.');
    if (r.status !== 'ativa') throw new ErroNegocio(409, 'Essa reserva não está mais ativa.');
    return r;
  }

  async editar(u: Usuario, id: string, d: ReservaEdicao) {
    const antes = await this.ativa(id);
    const { fim } = await this.conferir(u, d, false, id);
    const r = await this.db.$transaction(async (tx) => {
      const r = await tx.reserva.update({ where: { id }, data: this.dados(d, fim) });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'reservas', itemId: id, antes, depois: r });
      return r;
    });
    this.eventos.emitir('mudou', { area: 'reservas' });
    return r;
  }

  async cancelar(u: Usuario, id: string) {
    const antes = await this.ativa(id);
    await this.db.$transaction(async (tx) => {
      const r = await tx.reserva.update({ where: { id }, data: { status: 'cancelada' } });
      await auditar(tx, { atorId: u.acessoId, acao: 'cancelar', area: 'reservas', itemId: id, antes, depois: r });
    });
    this.eventos.emitir('mudou', { area: 'reservas' });
    return { ok: true };
  }

  async excluir(u: Usuario, id: string) {
    const antes = await this.db.reserva.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Reserva não encontrada.');
    await this.db.$transaction(async (tx) => {
      await tx.reserva.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'reservas', itemId: id, antes });
    });
    this.eventos.emitir('mudou', { area: 'reservas' });
    return { ok: true };
  }
}
