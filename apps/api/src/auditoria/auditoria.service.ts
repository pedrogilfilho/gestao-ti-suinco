import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../comum/prisma.service';
import { EventosService, type AreaEvento } from '../comum/eventos';
import { auditar, type Area } from '../comum/auditar';
import { ErroNegocio } from '../comum/erros';
import { paginar } from '../comum/lista';
import type { Usuario } from '../auth/decorators';

// áreas que podem ser restauradas e o modelo do Prisma de cada uma
const MODELOS = { setores: 'setor', pessoas: 'pessoa', equipamentos: 'equipamento', emprestimos: 'emprestimo', reservas: 'reserva' } as const;
type Modelo = (typeof MODELOS)[keyof typeof MODELOS];
const RESTAURAVEIS = new Set(['excluir', 'editar']);
// campos que não se regravam (identidade, datas automáticas e relações que vieram junto no "antes")
const FIXOS = new Set(['id', 'criadoEm', 'atualizadoEm', 'equipamento', 'pessoa', 'setor', 'tecnico', 'emprestimos', 'equipamentos', 'acesso']);
// o JSON da auditoria guarda datas como texto: estes campos voltam a ser Date
const DATAS = /(Em|Ate)$|^dataAtivacao$/;

type Repo = { findUnique: (a: object) => Promise<Record<string, unknown> | null>; findFirst: (a: object) => Promise<unknown>; update: (a: object) => Promise<Record<string, unknown>> };
const repo = (tx: Tx, m: Modelo) => (tx as unknown as Record<Modelo, Repo>)[m];

@Injectable()
export class AuditoriaService {
  constructor(private db: PrismaService, private eventos: EventosService) {}

  async listar(f: { area?: string; acao?: string; atorId?: string; itemId?: string; de?: string; ate?: string; cursor?: string; limite: number }) {
    const em: Prisma.DateTimeFilter = {};
    if (f.de) em.gte = new Date(`${f.de}T00:00:00-03:00`);
    if (f.ate) em.lte = new Date(`${f.ate}T23:59:59.999-03:00`);
    const regs = await this.db.auditoria.findMany({
      where: { area: f.area || undefined, acao: f.acao || undefined, atorId: f.atorId || undefined, itemId: f.itemId || undefined, ...(f.de || f.ate ? { em } : {}) },
      orderBy: [{ em: 'desc' }, { id: 'asc' }], take: f.limite + 1, ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
    });
    const pg = paginar(regs, f.limite);
    const atores = await this.db.acesso.findMany({
      where: { id: { in: [...new Set(pg.itens.map((r) => r.atorId).filter((x): x is string => !!x))] } },
      select: { id: true, pessoa: { select: { nome: true, email: true } } },
    });
    const porId = new Map(atores.map((a) => [a.id, a.pessoa]));
    return {
      itens: pg.itens.map((r) => ({ ...r, ator: r.atorId ? porId.get(r.atorId) ?? null : null, restauravel: r.area in MODELOS && RESTAURAVEIS.has(r.acao) })),
      proximo: pg.proximo,
    };
  }

  async restaurar(u: Usuario, id: string) {
    const reg = await this.db.auditoria.findUnique({ where: { id } });
    if (!reg || !reg.itemId) throw new ErroNegocio(404, 'Registro não encontrado.');
    const modelo = MODELOS[reg.area as keyof typeof MODELOS];
    if (!modelo || !RESTAURAVEIS.has(reg.acao)) throw new ErroNegocio(400, 'Esse registro não pode ser restaurado.');
    await this.db.$transaction(async (tx) => {
      const r = repo(tx, modelo);
      const atual = await r.findUnique({ where: { id: reg.itemId } });
      if (!atual) throw new ErroNegocio(404, 'O cadastro não existe mais.');
      let dados: Record<string, unknown>;
      if (reg.acao === 'excluir') {
        dados = { excluidoEm: null };
        await this.conflitoUnico(tx, modelo, atual);
      } else {
        const ultima = await tx.auditoria.findFirst({ where: { itemId: reg.itemId, area: reg.area }, orderBy: { em: 'desc' } });
        if (ultima?.id !== reg.id) throw new ErroNegocio(409, 'Esse cadastro mudou depois dessa alteração. Restaure a alteração mais recente primeiro.');
        dados = Object.fromEntries(
          Object.entries((reg.antes ?? {}) as Record<string, unknown>)
            .filter(([k]) => !FIXOS.has(k) && k in atual)
            .map(([k, v]) => [k, typeof v === 'string' && DATAS.test(k) ? new Date(v) : v]),
        );
        await this.conflitoUnico(tx, modelo, { ...atual, ...dados });
      }
      const novo = await r.update({ where: { id: reg.itemId }, data: dados });
      await auditar(tx, { atorId: u.acessoId, acao: 'restaurar', area: reg.area as Area, itemId: reg.itemId, antes: atual, depois: novo });
    });
    this.eventos.emitir('mudou', { area: reg.area as AreaEvento });
    return { ok: true };
  }

  // Restaurar não pode criar duplicado de Nome, e-mail, setor ou empréstimo aberto.
  private async conflitoUnico(tx: Tx, modelo: Modelo, reg: Record<string, unknown>) {
    const outro = { excluidoEm: null, id: { not: reg.id as string } };
    const checa = async (where: object, rotulo: string, valor: unknown) => {
      if (await repo(tx, modelo).findFirst({ where: { ...outro, ...where } }))
        throw new ErroNegocio(409, `Não dá para restaurar: já existe outro cadastro ativo com o mesmo ${rotulo} (${valor}).`);
    };
    if (modelo === 'equipamento') await checa({ codigo: { equals: reg.codigo, mode: 'insensitive' } }, 'Nome', reg.codigo);
    if (modelo === 'pessoa') await checa({ email: reg.email }, 'e-mail', reg.email);
    if (modelo === 'setor') await checa({ nome: { equals: reg.nome, mode: 'insensitive' } }, 'nome', reg.nome);
    if (modelo === 'emprestimo' && !reg.devolvidoEm)
      await checa({ equipamentoId: reg.equipamentoId, devolvidoEm: null }, 'equipamento emprestado', 'há outro empréstimo aberto');
    if (modelo === 'reserva' && reg.status === 'ativa')
      await checa({ equipamentoId: reg.equipamentoId, status: 'ativa', inicioEm: { lt: reg.fimEm }, fimEm: { gt: reg.inicioEm } }, 'equipamento reservado no horário', 'há outra reserva');
  }
}
