import { Injectable } from '@nestjs/common';
import type { Pedido, Prisma } from '@prisma/client';
import { limiteDe, textoRecusa, type Aprovar } from '@gestao/shared';
import { PrismaService, type Tx } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import { lerConfig } from '../comum/config-ler';
import { paginar, termos } from '../comum/lista';
import type { Usuario } from '../auth/decorators';
import { contarPosse, horarioReserva, motivoOcupado, ocupacaoDosEmprestaveis, reservaNoPeriodo } from '../reservas/ocupacao';
import { INCLUIR_PEDIDO, pedidoParaTela, type PedidoCompleto } from './pedidos.service';
import { dataHoraBR, fimDoDia } from './regras';

export type StatusListaPedido = 'pendentes' | 'urgentes' | 'semequip' | 'aprovados' | 'entregues' | 'recusados' | 'cancelados' | 'todos';

const FILTRO: Record<StatusListaPedido, Prisma.PedidoWhereInput> = {
  pendentes: { OR: [{ status: 'pendente' }, { ultimaDe: 'colab', status: { not: 'cancelado' } }] },
  urgentes: { status: 'pendente', urgente: true },
  semequip: { status: 'pendente' },
  aprovados: { status: 'aprovado' }, entregues: { status: 'entregue' }, recusados: { status: 'recusado' }, cancelados: { status: 'cancelado' },
  todos: {},
};
const ANALISE: StatusListaPedido[] = ['pendentes', 'urgentes', 'semequip'];
// fim do período do pedido: urgente sem devolução vai até o fim do dia
const fimDoPedido = (p: Pick<Pedido, 'retiradaEm' | 'devolucaoEm'>) => p.devolucaoEm ?? fimDoDia(p.retiradaEm);

@Injectable()
export class AnaliseService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  // Nenhum equipamento do tipo livre no período (só para pendentes; spec 3.6)
  private async semEquipamento(p: Pedido) {
    if (p.status !== 'pendente') return false;
    const l = (await ocupacaoDosEmprestaveis(this.db, await lerConfig(this.db), p.retiradaEm, fimDoPedido(p))).filter((x) => x.tipo === p.tipo);
    return l.length > 0 && l.every((x) => x.motivo);
  }

  private async paraTela(p: PedidoCompleto) {
    const atrasos = await this.db.emprestimo.count({ where: { pessoaId: p.pessoaId, devolvidoEm: null, excluidoEm: null, previsaoEm: { lt: new Date() } } });
    return { ...pedidoParaTela(p), semEquipamento: await this.semEquipamento(p), atrasos };
  }

  async listar(f: { status: StatusListaPedido; q: string; cursor?: string; limite: number }) {
    const porTermo = termos(f.q).map((t): Prisma.PedidoWhereInput => ({
      OR: [
        { pessoa: { nome: { contains: t, mode: 'insensitive' } } }, { pessoa: { email: { contains: t, mode: 'insensitive' } } },
        { pessoa: { setor: { nome: { contains: t, mode: 'insensitive' } } } }, { telefoneCorp: { contains: t } }, { telefonePart: { contains: t } },
        { tipo: { contains: t, mode: 'insensitive' } }, { finalidade: { contains: t, mode: 'insensitive' } }, { chamadoGlpi: { contains: t } },
      ],
    }));
    const where = { excluidoEm: null, ...FILTRO[f.status], AND: porTermo };
    const orderBy: Prisma.PedidoOrderByWithRelationInput[] = ANALISE.includes(f.status)
      ? [{ urgente: 'desc' }, { retiradaEm: 'asc' }, { criadoEm: 'asc' }, { id: 'asc' }]
      : [{ criadoEm: 'desc' }, { id: 'asc' }];
    if (f.status === 'semequip') {
      // calculado em memória: só os pendentes, que são poucos
      const todos = await Promise.all((await this.db.pedido.findMany({ where, include: INCLUIR_PEDIDO, orderBy })).map((p) => this.paraTela(p)));
      return { itens: todos.filter((p) => p.semEquipamento), proximo: null };
    }
    const itens = await this.db.pedido.findMany({ where, include: INCLUIR_PEDIDO, orderBy, take: f.limite + 1, ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }) });
    const pg = paginar(itens, f.limite);
    return { itens: await Promise.all(pg.itens.map((p) => this.paraTela(p))), proximo: pg.proximo };
  }

  async obter(u: Usuario, id: string) {
    const p = await this.db.pedido.findFirst({ where: { id, excluidoEm: null }, include: INCLUIR_PEDIDO });
    if (!p) throw new ErroNegocio(404, 'Pedido não encontrado.');
    if (!u.equipeTI && p.pessoaId !== u.pessoaId) throw new ErroNegocio(403, 'Você não tem permissão para isso.');
    return this.paraTela(p);
  }

  // Muda o pedido só se ainda estiver pendente; senão explica por quê (corrida com outro técnico ou com o colaborador).
  static async marcar(tx: Tx, id: string, data: Prisma.PedidoUncheckedUpdateManyInput) {
    const n = await tx.pedido.updateMany({ where: { id, status: 'pendente', excluidoEm: null }, data });
    if (n.count) return;
    const atual = await tx.pedido.findUnique({ where: { id } });
    if (!atual || atual.excluidoEm) throw new ErroNegocio(404, 'Este pedido não existe mais.');
    throw new ErroNegocio(409, atual.status === 'cancelado' ? 'O colaborador cancelou este pedido.' : `Este pedido já foi tratado (${atual.status}).`);
  }

  private async pendente(id: string) {
    const p = await this.db.pedido.findFirst({ where: { id, excluidoEm: null }, include: { pessoa: true } });
    if (!p) throw new ErroNegocio(404, 'Este pedido não existe mais.');
    if (p.status !== 'pendente') throw new ErroNegocio(409, p.status === 'cancelado' ? 'O colaborador cancelou este pedido.' : `Este pedido já foi tratado (${p.status}).`);
    return p;
  }

  async aprovar(u: Usuario, id: string, d: Aprovar) {
    const p = await this.pendente(id);
    const cfg = await lerConfig(this.db);
    const eq = await this.db.equipamento.findFirst({ where: { id: d.equipamentoId, excluidoEm: null } });
    if (!eq) throw new ErroNegocio(400, 'Escolha o equipamento.', 'equipamentoId');
    if (!cfg.tiposEmprestaveis.includes(eq.tipo as never)) throw new ErroNegocio(409, `${eq.codigo} não é um equipamento de empréstimo.`, 'equipamentoId');
    if (cfg.bloqueioAtraso) {
      const atrasados = await this.db.emprestimo.findMany({ where: { pessoaId: p.pessoaId, devolvidoEm: null, excluidoEm: null, previsaoEm: { lt: new Date() } }, include: { equipamento: true } });
      if (atrasados.length) {
        if (!d.liberarAtraso)
          throw new ErroNegocio(409, `${p.pessoa.nome} está com equipamento em atraso (${atrasados.map((a) => a.equipamento.codigo).join(', ')}). Novas reservas ficam bloqueadas até a devolução.`, undefined, 'atraso');
        if (!u.permissoes.has('excluir')) throw new ErroNegocio(403, 'Só o Administrador Master pode liberar essa exceção.');
      }
    }
    const lim = limiteDe(p.pessoa.limites, eq.tipo), tem = await contarPosse(this.db, p.pessoaId, eq.tipo, d.retiradaEm, d.devolucaoEm);
    if (tem >= lim) {
      if (!d.liberarLimite) throw new ErroNegocio(409, `${p.pessoa.nome} já está com ${tem} ${eq.tipo} nesse período (limite: ${lim}).`, undefined, 'limite');
      if (!u.permissoes.has('excluir')) throw new ErroNegocio(403, 'Só o Administrador Master pode liberar essa exceção.');
    }
    const outra = await reservaNoPeriodo(this.db, eq.id, d.retiradaEm, d.devolucaoEm);
    if (outra) throw new ErroNegocio(409, `${eq.codigo} já está reservado para ${outra.pessoa.nome} ${horarioReserva(outra, d.retiradaEm)}. Escolha outro.`, 'equipamentoId', 'conflito');
    const motivo = await motivoOcupado(this.db, eq, d.retiradaEm, d.devolucaoEm);
    if (motivo) throw new ErroNegocio(409, `${eq.codigo}: ${motivo}. Escolha outro equipamento ou ajuste as datas.`, 'equipamentoId', 'conflito');

    const agora = new Date();
    await this.db.$transaction(async (tx) => {
      await AnaliseService.marcar(tx, id, {
        status: 'aprovado', equipamentoId: eq.id, retiradaEm: d.retiradaEm, devolucaoEm: d.devolucaoEm, mensagemTi: d.mensagem,
        respondidoPorId: u.pessoaId, respondidoEm: agora, ultimaDe: 'ti', ultimaEm: agora,
      });
      const r = await tx.reserva.create({
        data: {
          equipamentoId: eq.id, pessoaId: p.pessoaId, inicioEm: d.retiradaEm, fimEm: d.devolucaoEm, finalidade: p.finalidade, finalidadeOutra: p.finalidadeOutra,
          chamadoGlpi: p.chamadoGlpi, pedidoId: id, criadoPorId: u.pessoaId,
          obs: [p.obs, (p.acessorios as string[]).length ? `Acessórios pedidos: ${(p.acessorios as string[]).join(', ')}` : ''].filter(Boolean).join(' | '),
        },
      });
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'sistema', texto: `Pedido aprovado. ${eq.codigo} reservado.`, em: agora } });
      if (d.mensagem) await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'ti', autorId: u.pessoaId, texto: d.mensagem, em: new Date(agora.getTime() + 1) } });
      if (d.atualizarTelefone && (p.telefoneCorp || p.telefonePart)) {
        const tel = { ...(p.telefoneCorp && { telefoneCorp: p.telefoneCorp }), ...(p.telefonePart && { telefonePart: p.telefonePart }) };
        const pessoa = await tx.pessoa.update({ where: { id: p.pessoaId }, data: tel });
        await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pessoas', itemId: p.pessoaId, antes: p.pessoa, depois: pessoa });
      }
      await auditar(tx, { atorId: u.acessoId, acao: 'aprovar', area: 'pedidos', itemId: id, antes: p, depois: { status: 'aprovado', equipamento: eq.codigo, reservaId: r.id } });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'reservas', itemId: r.id, depois: { ...r, equipamento: eq.codigo, pessoa: p.pessoa.nome } });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    this.eventos.emitir('mudou', { area: 'reservas' });
    return { ok: true, equipamento: eq.codigo };
  }

  async recusar(u: Usuario, id: string, r: { motivo: string; detalhe: string }) {
    const p = await this.pendente(id);
    const motivo = textoRecusa(r), agora = new Date();
    await this.db.$transaction(async (tx) => {
      await AnaliseService.marcar(tx, id, { status: 'recusado', motivoRecusa: motivo, respondidoPorId: u.pessoaId, respondidoEm: agora, ultimaDe: 'ti', ultimaEm: agora });
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'sistema', texto: 'Pedido recusado.', em: agora } });
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'ti', autorId: u.pessoaId, texto: motivo, em: new Date(agora.getTime() + 1) } });
      await auditar(tx, { atorId: u.acessoId, acao: 'recusar', area: 'pedidos', itemId: id, antes: p, depois: { status: 'recusado', motivoRecusa: motivo } });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    return { ok: true };
  }

  async avisarSemEquipamento(u: Usuario, id: string) {
    const p = await this.pendente(id);
    const periodo = `${dataHoraBR(p.retiradaEm)}${p.devolucaoEm ? ` até ${dataHoraBR(p.devolucaoEm)}` : ''}`;
    const texto = `Olá, ${p.pessoa.nome.split(' ')[0]}! Todos os equipamentos de ${p.tipo} já estão agendados para o período pedido (${periodo}). Podemos combinar outro dia ou horário? Responda por aqui.`;
    const agora = new Date();
    await this.db.$transaction(async (tx) => {
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'ti', autorId: u.pessoaId, texto, em: agora } });
      await tx.pedido.update({ where: { id }, data: { semEquipAvisadoEm: agora, ultimaDe: 'ti', ultimaEm: agora } });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    return { ok: true };
  }

  // Aprova um por um, em ordem de retirada: cada aprovação já cria a reserva, então o próximo não pega o mesmo equipamento.
  async aprovarLote(u: Usuario, ids: string[]) {
    const cfg = await lerConfig(this.db);
    const ps = await this.db.pedido.findMany({
      where: { id: { in: ids }, status: 'pendente', urgente: false, excluidoEm: null }, include: { pessoa: true }, orderBy: [{ retiradaEm: 'asc' }, { criadoEm: 'asc' }],
    });
    const aprovados: { id: string; nome: string; equipamento: string }[] = [], pendentes: { id: string; nome: string; motivo: string }[] = [];
    for (const p of ps) {
      const nome = p.pessoa.nome, fim = fimDoPedido(p);
      const fica = (motivo: string) => pendentes.push({ id: p.id, nome, motivo: `${nome}: ${motivo}` });
      if (cfg.bloqueioAtraso && await this.db.emprestimo.count({ where: { pessoaId: p.pessoaId, devolvidoEm: null, excluidoEm: null, previsaoEm: { lt: new Date() } } })) {
        fica('está com equipamento em atraso'); continue;
      }
      if (await contarPosse(this.db, p.pessoaId, p.tipo, p.retiradaEm, fim) >= limiteDe(p.pessoa.limites, p.tipo)) { fica(`atingiu o limite de ${p.tipo} nesse período`); continue; }
      const livre = (await ocupacaoDosEmprestaveis(this.db, cfg, p.retiradaEm, fim)).find((x) => x.tipo === p.tipo && !x.motivo);
      if (!livre) { fica(`sem ${p.tipo} livre nesse período`); continue; }
      try {
        await this.aprovar(u, p.id, { equipamentoId: livre.id, retiradaEm: p.retiradaEm, devolucaoEm: fim, mensagem: '' });
        aprovados.push({ id: p.id, nome, equipamento: livre.codigo });
      } catch (e) {
        fica(e instanceof ErroNegocio ? e.mensagem : 'erro ao gravar');
      }
    }
    return { aprovados, pendentes };
  }

  async excluir(u: Usuario, id: string) {
    const antes = await this.db.pedido.findFirst({ where: { id, excluidoEm: null } });
    if (!antes) throw new ErroNegocio(404, 'Pedido não encontrado.');
    await this.db.$transaction(async (tx) => {
      await tx.pedido.update({ where: { id }, data: { excluidoEm: new Date() } });
      await auditar(tx, { atorId: u.acessoId, acao: 'excluir', area: 'pedidos', itemId: id, antes });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [antes.pessoaId] });
    return { ok: true };
  }
}
