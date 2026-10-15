import { Injectable } from '@nestjs/common';
import type { Pedido, Pessoa, Prisma } from '@prisma/client';
import { limiteDe, type ConfigNucleo, type PedidoEntrada } from '@gestao/shared';
import { PrismaService } from '../comum/prisma.service';
import { auditar } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { EventosService } from '../comum/eventos';
import { ArquivosService } from '../comum/arquivos.service';
import { lerConfig } from '../comum/config-ler';
import type { Usuario } from '../auth/decorators';
import { contarPosse } from '../reservas/ocupacao';
import { conferirHorarios, dataHoraBR, fimDoDia } from './regras';

export const INCLUIR_PEDIDO = {
  pessoa: { select: { id: true, nome: true, email: true, telefoneCorp: true, telefonePart: true, setor: { select: { nome: true } } } },
  equipamento: { select: { id: true, codigo: true, tipo: true, modelo: true } },
  mensagens: { orderBy: { em: 'asc' as const }, include: { autor: { select: { nome: true } } } },
  reserva: { select: { id: true, status: true } },
  emprestimo: { select: { id: true } },
} satisfies Prisma.PedidoInclude;
export type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof INCLUIR_PEDIDO }>;

// O que as telas recebem: sem o caminho do arquivo da assinatura.
export const pedidoParaTela = (p: PedidoCompleto) => {
  const { assinaturaUrl, ...resto } = p;
  return { ...resto, pessoa: { ...p.pessoa, setor: p.pessoa.setor.nome }, temAssinatura: !!assinaturaUrl };
};

@Injectable()
export class PedidosService {
  constructor(private db: PrismaService, private eventos: EventosService, private arquivos: ArquivosService) {}

  // Telefones do pedido: os do cadastro (confirmados) ou os informados (spec 3.4).
  private telefones(pessoa: Pessoa, d: PedidoEntrada) {
    const temCadastro = !!(pessoa.telefoneCorp || pessoa.telefonePart);
    if (temCadastro && d.telefonesConferem === undefined)
      throw new ErroNegocio(400, 'Confirme se os seus telefones estão corretos.', 'telefonesConferem');
    if (temCadastro && d.telefonesConferem) return { telefoneCorp: pessoa.telefoneCorp, telefonePart: pessoa.telefonePart };
    if (!d.telefoneCorp && !d.telefonePart)
      throw new ErroNegocio(400, 'Informe pelo menos um telefone com DDD, por exemplo (34) 99999-9999.', 'telefoneCorp');
    return { telefoneCorp: d.telefoneCorp ?? null, telefonePart: d.telefonePart ?? null };
  }

  private async conferir(u: Usuario, d: PedidoEntrada, cfg: ConfigNucleo, editando?: Pedido) {
    const pessoa = await this.db.pessoa.findFirst({ where: { id: u.pessoaId, excluidoEm: null } });
    if (!pessoa) throw new ErroNegocio(403, 'Seu cadastro não foi encontrado. Fale com a TI.');
    if (!cfg.tiposEmprestaveis.includes(d.tipo as never)) throw new ErroNegocio(400, 'Escolha o tipo de equipamento.', 'tipo');
    if (cfg.bloqueioAtraso) {
      const atrasados = await this.db.emprestimo.findMany({
        where: { pessoaId: pessoa.id, devolvidoEm: null, excluidoEm: null, previsaoEm: { lt: new Date() } }, include: { equipamento: true },
      });
      if (atrasados.length)
        throw new ErroNegocio(409, `Você está com equipamento em atraso (${atrasados.map((a) => a.equipamento.codigo).join(', ')}). Devolva-o à TI antes de fazer um novo pedido.`, undefined, 'atraso');
    }
    const tels = this.telefones(pessoa, d);
    const agora = new Date();
    let retiradaEm = agora, devolucaoEm: Date | null = null, ateLimite = fimDoDia(agora);
    if (!d.urgente) {
      if (d.finalidade !== 'Outra' && !cfg.finalidades.some((f) => f.nome === d.finalidade)) throw new ErroNegocio(400, 'Escolha a finalidade.', 'finalidade');
      conferirHorarios(cfg, d.retiradaEm, d.devolucaoEm, agora);
      retiradaEm = d.retiradaEm; devolucaoEm = d.devolucaoEm; ateLimite = d.devolucaoEm;
    } else if (editando) {
      retiradaEm = editando.retiradaEm;
    }
    // limite: empréstimos + reservas (um pedido aprovado já virou reserva)
    const lim = limiteDe(pessoa.limites, d.tipo), tem = await contarPosse(this.db, pessoa.id, d.tipo, retiradaEm, ateLimite);
    if (tem >= lim)
      throw new ErroNegocio(409, `Nesse período você já tem ${tem} ${d.tipo} (entre empréstimos e pedidos aprovados) e o seu limite é ${lim}. Escolha outro período, devolva um item ou cancele um pedido. Se precisar de mais, fale com a TI.`, undefined, 'limite');
    if (cfg.assinaturas && !d.assinatura && !editando?.assinaturaUrl)
      throw new ErroNegocio(400, 'Assine no quadro "Sua assinatura" para enviar o pedido.', 'assinatura');
    if (!d.urgente && !d.confirmarRepetido) {
      const dup = await this.db.pedido.findFirst({
        where: {
          pessoaId: pessoa.id, status: 'pendente', urgente: false, excluidoEm: null, retiradaEm: { lt: d.devolucaoEm }, devolucaoEm: { gt: d.retiradaEm },
          ...(editando && { id: { not: editando.id } }),
        },
      });
      if (dup)
        throw new ErroNegocio(409, `Você já tem um pedido pendente para esse período (${dataHoraBR(dup.retiradaEm)} até ${dataHoraBR(dup.devolucaoEm!)}).\n\nEnviar mesmo assim?`, undefined, 'repetido');
    }
    return { pessoa, tels, retiradaEm, devolucaoEm };
  }

  private async dados(d: PedidoEntrada, x: { tels: object; retiradaEm: Date; devolucaoEm: Date | null }) {
    const assinaturaUrl = d.assinatura ? await this.arquivos.salvarPng(d.assinatura, 'assinaturas') : undefined;
    return {
      tipo: d.tipo, urgente: d.urgente, ...x.tels, retiradaEm: x.retiradaEm, devolucaoEm: x.devolucaoEm, ...(assinaturaUrl && { assinaturaUrl }),
      ...(d.urgente
        ? { justificativa: d.justificativa, finalidade: 'Urgência', finalidadeOutra: '', chamadoGlpi: '', acessorios: [], obs: '' }
        : {
          justificativa: '', finalidade: d.finalidade, finalidadeOutra: d.finalidade === 'Outra' ? d.finalidadeOutra : '',
          chamadoGlpi: d.chamadoGlpi, acessorios: d.acessorios, obs: d.obs,
        }),
    };
  }

  async criar(u: Usuario, d: PedidoEntrada) {
    if (u.papel !== 'solicitante') throw new ErroNegocio(403, 'A TI não faz pedidos: registre o empréstimo ou a reserva direto.');
    const cfg = await lerConfig(this.db);
    const x = await this.conferir(u, d, cfg);
    const dados = await this.dados(d, x);
    const p = await this.db.$transaction(async (tx) => {
      const p = await tx.pedido.create({ data: { pessoaId: x.pessoa.id, ...dados } });
      await auditar(tx, { atorId: u.acessoId, acao: 'criar', area: 'pedidos', itemId: p.id, depois: p });
      return p;
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [x.pessoa.id] });
    return p;
  }

  // Pedido do próprio colaborador (403 para os outros).
  private async doDono(u: Usuario, id: string) {
    const p = await this.db.pedido.findFirst({ where: { id, excluidoEm: null } });
    if (!p) throw new ErroNegocio(404, 'Pedido não encontrado.');
    if (p.pessoaId !== u.pessoaId) throw new ErroNegocio(403, 'Você não tem permissão para isso.');
    return p;
  }

  async editar(u: Usuario, id: string, d: PedidoEntrada) {
    const antes = await this.doDono(u, id);
    if (antes.status !== 'pendente') throw new ErroNegocio(409, 'Esse pedido já foi respondido pela TI e não pode mais ser editado.');
    const cfg = await lerConfig(this.db);
    const x = await this.conferir(u, d, cfg, antes);
    const dados = await this.dados(d, x);
    const agora = new Date();
    const p = await this.db.$transaction(async (tx) => {
      // só muda se continuar pendente (a TI pode ter respondido no meio-tempo)
      const n = await tx.pedido.updateMany({ where: { id, status: 'pendente' }, data: { ...dados, editadoEm: agora, ultimaDe: 'colab', ultimaEm: agora } });
      if (!n.count) throw new ErroNegocio(409, 'Esse pedido já foi respondido pela TI e não pode mais ser editado.');
      await tx.pedidoMensagem.create({ data: { pedidoId: id, de: 'sistema', texto: 'O colaborador editou o pedido.', em: agora } });
      const p = await tx.pedido.findUniqueOrThrow({ where: { id } });
      await auditar(tx, { atorId: u.acessoId, acao: 'editar', area: 'pedidos', itemId: id, antes, depois: p });
      return p;
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [p.pessoaId] });
    return p;
  }

  async cancelar(u: Usuario, id: string) {
    const antes = await this.doDono(u, id);
    await this.db.$transaction(async (tx) => {
      const n = await tx.pedido.updateMany({ where: { id, status: 'pendente' }, data: { status: 'cancelado' } });
      if (!n.count) throw new ErroNegocio(409, 'Esse pedido já foi respondido pela TI e não pode mais ser cancelado.');
      await auditar(tx, { atorId: u.acessoId, acao: 'cancelar', area: 'pedidos', itemId: id, antes, depois: { status: 'cancelado' } });
    });
    this.eventos.emitir('mudou', { area: 'pedidos', pessoaIds: [antes.pessoaId] });
    return { ok: true };
  }

  async meus(u: Usuario) {
    const ps = await this.db.pedido.findMany({ where: { pessoaId: u.pessoaId, excluidoEm: null }, include: INCLUIR_PEDIDO, orderBy: { criadoEm: 'desc' }, take: 100 });
    return { itens: ps.map(pedidoParaTela) };
  }
}
