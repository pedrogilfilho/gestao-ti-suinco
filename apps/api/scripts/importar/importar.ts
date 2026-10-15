// Importa o backup do sistema atual ("Configurações → Baixar backup completo") para o banco novo.
// Só o núcleo: setores, pessoas, fotos, grupos, acessos, equipamentos, empréstimos e configuração.
import type { PrismaClient } from '@prisma/client';
import { chaveNome, configNucleoSchema, PERMISSOES } from '@gestao/shared';
import { ArquivosService } from '../../src/comum/arquivos.service';
import { gerarHash, senhaTemporaria, ehDono } from '../../src/auth/senha';
import { mapearPessoas, mapearAcessos, mapearEquipamentos, mapearEmprestimos, mapearPedidos, mapearReservas, mapearConfig, SEM_SETOR, type Doc, type Ignorado } from './mapear';

export type Relatorio = {
  criados: Record<'setores' | 'pessoas' | 'fotos' | 'assinaturas' | 'grupos' | 'acessos' | 'equipamentos' | 'emprestimos' | 'pedidos' | 'reservas' | 'mensagens', number>;
  ignorados: Ignorado[];
  avisos: string[];
  senhasDonos: { email: string; senha: string }[];
};

class Ensaio extends Error {
  constructor(public relatorio: Relatorio) { super('ensaio'); }
}

const arr = (v: unknown): Doc[] => (Array.isArray(v) ? (v as Doc[]) : []);

export async function importar(db: PrismaClient, backup: Doc, opcoes: { ensaio: boolean; arquivos?: ArquivosService }): Promise<Relatorio> {
  if (!Array.isArray(backup?.usuarios) || !Array.isArray(backup?.equipamentos))
    throw new Error('Esse arquivo não parece um backup do sistema (faltam usuarios e equipamentos).');
  if ((await db.setor.count()) + (await db.pessoa.count()) + (await db.equipamento.count()) > 0)
    throw new Error('O banco já tem dados. A importação é feita num banco vazio.');

  const arquivos = opcoes.arquivos ?? new ArquivosService();
  // no ensaio não grava arquivo nenhum: só conta
  const salvarPng = async (b64: string) => (opcoes.ensaio ? 'ensaio.png' : arquivos.salvarPng(b64, 'assinaturas'));
  const salvarFoto = async (b64: string) => (opcoes.ensaio ? 'ensaio.jpg' : arquivos.salvarFoto(b64));

  const rel: Relatorio = {
    criados: { setores: 0, pessoas: 0, fotos: 0, assinaturas: 0, grupos: 0, acessos: 0, equipamentos: 0, emprestimos: 0, pedidos: 0, reservas: 0, mensagens: 0 },
    ignorados: [], avisos: [], senhasDonos: [],
  };

  try {
    await db.$transaction(async (tx) => {
      // 1. setores
      const setorPorChave = new Map<string, string>();
      const criarSetor = async (nome: string) => {
        const s = await tx.setor.create({ data: { nome } });
        setorPorChave.set(chaveNome(nome), s.id);
        rel.criados.setores++;
        return s.id;
      };
      for (const s of arr(backup.setores)) {
        const nome = String(s.nome ?? '').trim().replace(/\s+/g, ' ');
        if (!nome) continue;
        if (setorPorChave.has(chaveNome(nome))) { rel.avisos.push(`Setor "${nome}" repetido no backup; ficou um só.`); continue; }
        await criarSetor(nome);
      }
      let semSetor: string | null = null;
      const setorDe = async (id: string) => (id === SEM_SETOR ? (semSetor ??= await criarSetor('(sem setor)')) : id);

      // 2. pessoas (de Usuários e, para quem só existe em Acessos, do próprio acesso)
      const emailsUsuarios = new Set(arr(backup.usuarios).map((u) => String(u.id ?? u.email ?? '').trim().toLowerCase()));
      const soEmAcessos = arr(backup.acessos).filter((a) => !emailsUsuarios.has(String(a.id ?? '').trim().toLowerCase()));
      for (const a of soEmAcessos) rel.avisos.push(`${String(a.id).trim().toLowerCase()} só existia em Acessos; foi criado também em Usuários.`);
      const pessoas = mapearPessoas([...arr(backup.usuarios), ...soEmAcessos], setorPorChave);
      rel.avisos.push(...pessoas.avisos);
      const pessoaPorEmail = new Map<string, string>(), nomes = new Map<string, string[]>();
      for (const p of pessoas.dados) {
        const assinaturaUrl = p.assinatura ? await salvarPng(p.assinatura) : null;
        if (assinaturaUrl) rel.criados.assinaturas++;
        const criada = await tx.pessoa.create({
          data: {
            nome: p.nome, email: p.email, setorId: await setorDe(p.setorId), telefoneCorp: p.telefoneCorp, telefonePart: p.telefonePart,
            login: p.login, ativo: p.ativo, limites: p.limites, assinaturaUrl,
          },
        });
        pessoaPorEmail.set(p.email, criada.id);
        nomes.set(chaveNome(p.nome), [...(nomes.get(chaveNome(p.nome)) ?? []), criada.id]);
        rel.criados.pessoas++;
      }
      // nome só serve para casar vínculo antigo quando é único
      const pessoaPorNome = new Map([...nomes].filter(([, ids]) => ids.length === 1).map(([n, ids]) => [n, ids[0]!]));

      // 3. fotos
      for (const f of arr(backup.fotos)) {
        const pid = pessoaPorEmail.get(String(f.id ?? '').trim().toLowerCase());
        if (!pid || typeof f.foto !== 'string') continue;
        try {
          await tx.pessoa.update({ where: { id: pid }, data: { fotoUrl: await salvarFoto(f.foto) } });
          rel.criados.fotos++;
        } catch {
          rel.avisos.push(`Foto de ${f.id} não é uma imagem válida; ficou sem foto.`);
        }
      }

      // 4. grupos de acesso (ficavam na configuração)
      const grupoPorIdAntigo = new Map<string, string>();
      for (const g of arr(backup.config?.gruposAcesso)) {
        const nome = String(g.nome ?? '').trim();
        if (!nome || !g.id) continue;
        const perms: Record<string, boolean> = Object.fromEntries(Object.entries((g.perms ?? {}) as Record<string, unknown>).filter(([k, v]) => v === true && (PERMISSOES as readonly string[]).includes(k)).map(([k]) => [k, true]));
        const novo = await tx.grupoAcesso.create({ data: { nome, permissoes: perms } });
        grupoPorIdAntigo.set(String(g.id), novo.id);
        rel.criados.grupos++;
      }

      // 5. acessos (sem senha; os donos recebem uma temporária, os outros pela tela de Acessos)
      const acessos = mapearAcessos(arr(backup.acessos), pessoaPorEmail, grupoPorIdAntigo);
      rel.avisos.push(...acessos.avisos);
      for (const a of acessos.dados) {
        const criado = await tx.acesso.create({ data: { pessoaId: a.pessoaId, papel: a.papel, grupoId: a.grupoId, permissoes: a.permissoes, suspenso: a.suspenso } });
        rel.criados.acessos++;
        if (ehDono(a.origem)) {
          const senha = senhaTemporaria();
          await tx.credencialLocal.create({ data: { acessoId: criado.id, senhaHash: await gerarHash(senha), trocarNoProximoLogin: true } });
          rel.senhasDonos.push({ email: a.origem, senha });
        }
      }

      // 6. equipamentos
      const equips = mapearEquipamentos(arr(backup.equipamentos), pessoaPorEmail, pessoaPorNome, setorPorChave);
      rel.avisos.push(...equips.avisos);
      const equipPorCodigo = new Map<string, string>();
      for (const { origem, ...e } of equips.dados) {
        const criado = await tx.equipamento.create({ data: e });
        equipPorCodigo.set(e.codigo.toLowerCase(), criado.id);
        rel.criados.equipamentos++;
      }

      // 7. empréstimos
      const emps = mapearEmprestimos(arr(backup.emprestimos), equipPorCodigo, pessoaPorEmail);
      rel.avisos.push(...emps.avisos);
      rel.ignorados.push(...emps.ignorados);
      const empPorOrigem = new Map<string, string>();
      for (const { origem, assinaturaRetirada, assinaturaDevolucao, ...e } of emps.dados) {
        const assinaturaRetiradaUrl = assinaturaRetirada ? await salvarPng(assinaturaRetirada) : null;
        const assinaturaDevolucaoUrl = assinaturaDevolucao ? await salvarPng(assinaturaDevolucao) : null;
        rel.criados.assinaturas += Number(!!assinaturaRetiradaUrl) + Number(!!assinaturaDevolucaoUrl);
        const criado = await tx.emprestimo.create({ data: { ...e, assinaturaRetiradaUrl, assinaturaDevolucaoUrl } });
        empPorOrigem.set(origem, criado.id);
        rel.criados.emprestimos++;
      }
      // liga o empréstimo à reserva e ao pedido de onde veio (no máximo um de cada)
      const ligados = new Set<string>();
      const ligar = async (empOrigem: string | null, campo: 'reservaId' | 'pedidoId', id: string, quem: string) => {
        const empId = empOrigem ? empPorOrigem.get(empOrigem) : undefined;
        if (!empId) return;
        if (ligados.has(`${campo}:${empId}`)) { rel.avisos.push(`${quem}: o empréstimo ${empOrigem} já estava ligado a outro registro; ficou sem a ligação.`); return; }
        ligados.add(`${campo}:${empId}`);
        await tx.emprestimo.update({ where: { id: empId }, data: { [campo]: id } });
      };

      // 7b. pedidos (módulo 2), com a conversa
      const peds = mapearPedidos(arr(backup.pedidos), pessoaPorEmail, equipPorCodigo);
      rel.ignorados.push(...peds.ignorados);
      const pedidoPorOrigem = new Map<string, string>();
      for (const { origem, mensagens, assinatura, empOrigem, ...p } of peds.dados) {
        const assinaturaUrl = assinatura ? await salvarPng(assinatura) : null;
        rel.criados.assinaturas += Number(!!assinaturaUrl);
        const criado = await tx.pedido.create({ data: { ...p, assinaturaUrl } });
        if (mensagens.length) await tx.pedidoMensagem.createMany({ data: mensagens.map((m) => ({ ...m, pedidoId: criado.id })) });
        rel.criados.mensagens += mensagens.length;
        pedidoPorOrigem.set(origem, criado.id);
        await ligar(empOrigem, 'pedidoId', criado.id, `Pedido ${origem}`);
        rel.criados.pedidos++;
      }

      // 7c. reservas (módulo 2)
      const ress = mapearReservas(arr(backup.reservas), pessoaPorEmail, equipPorCodigo);
      rel.ignorados.push(...ress.ignorados);
      const pedidoUsado = new Set<string>();
      for (const { origem, pedidoOrigem, empOrigem, ...r } of ress.dados) {
        let pedidoId = pedidoOrigem ? pedidoPorOrigem.get(pedidoOrigem) ?? null : null;
        if (pedidoId && pedidoUsado.has(pedidoId)) { rel.avisos.push(`Reserva ${origem}: o pedido ${pedidoOrigem} já tinha outra reserva; ficou sem a ligação.`); pedidoId = null; }
        if (pedidoId) pedidoUsado.add(pedidoId);
        const criado = await tx.reserva.create({ data: { ...r, pedidoId } });
        await ligar(empOrigem, 'reservaId', criado.id, `Reserva ${origem}`);
        rel.criados.reservas++;
      }

      // 8. configuração do núcleo
      const cfg = configNucleoSchema.parse(mapearConfig(backup.config));
      await tx.config.create({ data: { chave: 'nucleo', valor: cfg } });

      // um único registro de auditoria para a importação inteira (sem as senhas)
      const { senhasDonos, ...semSenhas } = rel;
      await tx.auditoria.create({
        data: { atorId: null, acao: 'criar', area: 'config', itemId: 'importacao', depois: { ...semSenhas, geradoEm: backup.geradoEm ?? null } as never },
      });

      if (opcoes.ensaio) throw new Ensaio(rel);
    }, { timeout: 600_000, maxWait: 30_000 });
  } catch (e) {
    if (e instanceof Ensaio) return e.relatorio;
    throw e;
  }
  return rel;
}
