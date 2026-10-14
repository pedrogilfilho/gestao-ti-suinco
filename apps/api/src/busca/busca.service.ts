import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../comum/prisma.service';
import { termos } from '../comum/lista';
import { idsPorTelefone } from '../comum/telefone';

type Item = { id: string; t: string; sub: string; ir: string };
type NomeGrupo = 'Equipamentos' | 'Usuários' | 'Empréstimos';
type Grupo = { nome: NomeGrupo; total: number; itens: Item[] };
const ci = (t: string) => ({ contains: t, mode: 'insensitive' as const });
const url = (rota: string, q: string) => `${rota}?q=${encodeURIComponent(q)}`;
const CAMPOS_EQUIP = ['codigo', 'tipo', 'modelo', 'patrimonio', 'serie', 'ip', 'mac', 'numeroCorp', 'numeroPart', 'obs', 'vinculoLivre'] as const;

// Busca geral do topo: até 5 por grupo, com o total de cada um.
@Injectable()
export class BuscaService {
  constructor(private db: PrismaService) {}

  async buscar(q: string): Promise<{ grupos: Grupo[] }> {
    const ts = termos(q);
    if (q.trim().length < 2 || !ts.length) return { grupos: [] };

    const eqTermos = await Promise.all(ts.map(async (t): Promise<Prisma.EquipamentoWhereInput> => {
      const tel = await idsPorTelefone(this.db, 'equipamento', t);
      return { OR: [...CAMPOS_EQUIP.map((c) => ({ [c]: ci(t) })), ...(tel.length ? [{ id: { in: tel } }] : [])] };
    }));
    const peTermos = await Promise.all(ts.map(async (t): Promise<Prisma.PessoaWhereInput> => {
      const tel = await idsPorTelefone(this.db, 'pessoa', t);
      return {
        OR: [
          { nome: ci(t) }, { email: ci(t) }, { login: ci(t) }, { setor: { nome: ci(t) } },
          { telefoneCorp: { contains: t } }, { telefonePart: { contains: t } },
          ...(tel.length ? [{ id: { in: tel } }] : []),
        ],
      };
    }));
    const eqWhere: Prisma.EquipamentoWhereInput = { excluidoEm: null, AND: eqTermos };
    const peWhere: Prisma.PessoaWhereInput = { excluidoEm: null, AND: peTermos };
    const emWhere: Prisma.EmprestimoWhereInput = {
      excluidoEm: null,
      AND: ts.map((t) => ({ OR: [{ equipamento: { codigo: ci(t) } }, { pessoa: { nome: ci(t) } }, { pessoa: { email: ci(t) } }, { chamadoGlpi: { contains: t } }] })),
    };

    const [eqs, eqN, pes, peN, ems, emN] = await Promise.all([
      this.db.equipamento.findMany({ where: eqWhere, take: 5, orderBy: { codigo: 'asc' }, include: { pessoa: { select: { nome: true } } } }),
      this.db.equipamento.count({ where: eqWhere }),
      this.db.pessoa.findMany({ where: peWhere, take: 5, orderBy: { nome: 'asc' }, include: { setor: { select: { nome: true } } } }),
      this.db.pessoa.count({ where: peWhere }),
      this.db.emprestimo.findMany({ where: emWhere, take: 5, orderBy: { retiradaEm: 'desc' }, include: { equipamento: { select: { codigo: true } }, pessoa: { select: { nome: true } } } }),
      this.db.emprestimo.count({ where: emWhere }),
    ]);

    const grupos: Grupo[] = [
      {
        nome: 'Equipamentos', total: eqN,
        itens: eqs.map((e) => ({
          id: e.id, t: `${e.codigo} · ${e.tipo}`, ir: url('/equipamentos', e.codigo),
          sub: [e.modelo, e.patrimonio && `patrimônio ${e.patrimonio}`, e.pessoa?.nome ?? e.vinculoLivre].filter(Boolean).join(' · '),
        })),
      },
      {
        nome: 'Usuários', total: peN,
        itens: pes.map((p) => ({
          id: p.id, t: `${p.nome} / ${p.email}`, ir: url('/usuarios', p.email),
          sub: [p.setor.nome, p.telefoneCorp, p.telefonePart].filter(Boolean).join(' · '),
        })),
      },
      {
        nome: 'Empréstimos', total: emN,
        itens: ems.map((e) => ({
          id: e.id, t: `${e.equipamento.codigo} · ${e.pessoa.nome}`, ir: `${url('/em-uso', e.equipamento.codigo)}&status=todos`,
          sub: [e.devolvidoEm ? 'devolvido' : 'em aberto', e.chamadoGlpi && `GLPI ${e.chamadoGlpi}`].filter(Boolean).join(' · '),
        })),
      },
    ];
    return { grupos: grupos.filter((g) => g.total > 0) };
  }
}
