// Conversão do backup do sistema atual (Firebase, "Baixar backup completo") para o modelo novo.
// Funções puras: recebem as listas do backup e os mapas de ids já criados; devolvem os dados e os avisos.
import {
  chaveNome, configNucleoSchema, telefoneSchema, PERMISSOES, TIPOS_EQUIP, TIPOS_COM_IP, TIPOS_LOCAL_FIXO, SITUACOES,
  type Papel, type Permissao, type TipoEquip, type ConfigNucleo,
} from '@gestao/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;
export const SEM_SETOR = '__sem_setor__';
export type Ignorado = { area: string; id: string; motivo: string };

const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const email = (v: unknown) => txt(v).toLowerCase();
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(txt).filter(Boolean) : []);
const tel = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  const r = telefoneSchema.safeParse(s);
  return r.success ? r.data : s;
};

// "AAAA-MM-DD" ou "DD/MM/AAAA" + "HH:MM" no horário de Brasília
export function dataHoraSP(data: unknown, hora: unknown, horaPadrao = '00:00'): Date | null {
  let d = txt(data);
  const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) d = `${br[3]}-${br[2]}-${br[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const h = /^\d{2}:\d{2}$/.test(txt(hora)) ? txt(hora) : horaPadrao;
  const r = new Date(`${d}T${h}:00-03:00`);
  return Number.isNaN(r.getTime()) ? null : r;
}
// só a data (colunas @db.Date): meia-noite UTC do dia informado
const dataSimples = (v: unknown): Date | null => {
  const r = dataHoraSP(v, '', '00:00'); // 00:00 em Brasília = 03:00 UTC do mesmo dia
  return r ? new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate())) : null;
};
const imagemPng = (v: unknown) => (typeof v === 'string' && v.startsWith('data:image/png;base64,') ? v : null);
const tipoNovo = (t: string) => (t === 'Notebook de empréstimo' ? 'Notebook Empréstimo' : t);

// ---------- pessoas ----------
export type PessoaNova = {
  origem: string; email: string; nome: string; setorId: string; telefoneCorp: string | null; telefonePart: string | null;
  login: string; ativo: boolean; limites: Record<string, number>; assinatura: string | null;
};

export function mapearPessoas(usuarios: Doc[], setorPorChave: Map<string, string>) {
  const dados: PessoaNova[] = [], avisos: string[] = [], vistos = new Set<string>();
  for (const u of usuarios) {
    const e = email(u.id ?? u.email);
    if (!e) { avisos.push(`Usuário sem e-mail ignorado (${txt(u.nome) || 'sem nome'}).`); continue; }
    if (vistos.has(e)) { avisos.push(`Usuário ${e}: e-mail repetido no backup; ficou o primeiro.`); continue; }
    vistos.add(e);
    const nomeSetor = txt(u.setor);
    let setorId = setorPorChave.get(chaveNome(nomeSetor));
    if (!setorId) {
      setorId = SEM_SETOR;
      avisos.push(`Usuário ${e}: setor "${nomeSetor}" não existe; criado no setor "(sem setor)".`);
    }
    const limites = u.limiteExtra && u.limites && typeof u.limites === 'object'
      ? Object.fromEntries(Object.entries(u.limites as Record<string, unknown>).map(([k, v]) => [tipoNovo(k), Number(v)]).filter(([, v]) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50))
      : {};
    dados.push({
      origem: e, email: e, nome: txt(u.nome) || e, setorId,
      telefoneCorp: tel(u.telefone), telefonePart: tel(u.telefonePart), login: txt(u.login),
      ativo: u.ativo !== false, limites: limites as Record<string, number>, assinatura: u.tecnico ? imagemPng(u.assinatura) : null,
    });
  }
  return { dados, avisos };
}

// ---------- acessos ----------
export type AcessoNovo = { origem: string; pessoaId: string; papel: Papel; grupoId: string | null; permissoes: Partial<Record<Permissao, boolean>>; suspenso: boolean };
const PAPEL: Record<string, Papel> = { admin: 'master', tecnico: 'tic', consulta: 'consulta', solicitante: 'solicitante', grupo: 'tic', personalizado: 'tic' };

export function mapearAcessos(acessos: Doc[], pessoaPorEmail: Map<string, string>, grupoPorIdAntigo: Map<string, string>) {
  const dados: AcessoNovo[] = [], avisos: string[] = [];
  for (const a of acessos) {
    const e = email(a.id ?? a.email);
    const pessoaId = pessoaPorEmail.get(e);
    if (!pessoaId) { avisos.push(`Acesso de ${e} ignorado: a pessoa não está em Usuários no backup.`); continue; }
    const papel = PAPEL[txt(a.papel)] ?? 'solicitante';
    if (!PAPEL[txt(a.papel)]) avisos.push(`Acesso de ${e}: perfil "${txt(a.papel)}" desconhecido; ficou como Solicitante.`);
    const marcadas = (a.permissoes ?? {}) as Record<string, unknown>;
    const permissoes: Partial<Record<Permissao, boolean>> = Object.fromEntries(PERMISSOES.filter((p) => marcadas[p] === true).map((p) => [p, true]));
    // as duas exceções do app atual viram permissões marcadas (PROJETO.md 6.1)
    if (permissoes.equipamentos) permissoes.almoxarifado = true;
    if (papel === 'tic') permissoes.auditoria = true;
    const grupoId = a.grupo ? grupoPorIdAntigo.get(txt(a.grupo)) ?? null : null;
    if (a.grupo && !grupoId) avisos.push(`Acesso de ${e}: grupo "${txt(a.grupo)}" não existe mais; ficou com as permissões do próprio acesso.`);
    dados.push({ origem: e, pessoaId, papel, grupoId, permissoes, suspenso: a.suspenso === true });
  }
  return { dados, avisos };
}

// ---------- equipamentos ----------
const CAMPOS_EQUIP = new Set([
  'id', 'tipo', 'modelo', 'patrimonio', 'serie', 'obs', 'situacao', 'atribuidoA', 'atribuidoEmail', 'atribuidoEm', 'somenteCadastro',
  'termoAssinado', 'centroCusto', 'termoObs', 'numero', 'numeroPart', 'tipoChip', 'ipTipo', 'ip', 'mac', 'garantia', 'predio',
  'pontoRede', 'firmware', 'trocasCabeca', 'licencas', 'dataAtivacao', 'termo',
]);
const IGNORAR = new Set(['criadoEm', 'criadoPor', 'atualizadoEm', 'atualizadoPor']);

export type EquipNovo = {
  origem: string; codigo: string; tipo: string; modelo: string; patrimonio: string; serie: string; situacao: (typeof SITUACOES)[number];
  somenteCadastro: boolean; pessoaId: string | null; vinculoLivre: string; vinculadoEm: Date | null; setorId: string | null;
  ipTipo: 'dhcp' | 'fixo' | null; ip: string | null; mac: string | null; numeroCorp: string | null; numeroPart: string | null;
  tipoChip: string; termoStatus: 'assinado' | 'nao_assinado' | 'nao_informado'; termoObs: string; garantiaAte: Date | null;
  predio: string; pontoRede: string; firmware: string; trocasCabeca: number | null; licencas: { nome: string; chave: string }[];
  dataAtivacao: Date | null; obs: string;
};

export function mapearEquipamentos(equips: Doc[], pessoaPorEmail: Map<string, string>, pessoaPorNome: Map<string, string>, setorPorChave: Map<string, string>) {
  const dados: EquipNovo[] = [], avisos: string[] = [], vistos = new Set<string>();
  for (const q of equips) {
    const codigo = txt(q.id ?? q.codigo);
    if (!codigo) { avisos.push('Equipamento sem Nome ignorado.'); continue; }
    if (vistos.has(codigo.toLowerCase())) { avisos.push(`Equipamento ${codigo}: Nome repetido no backup; ficou o primeiro.`); continue; }
    vistos.add(codigo.toLowerCase());
    const extras: string[] = [];
    let tipo = tipoNovo(txt(q.tipo));
    if (!(TIPOS_EQUIP as readonly string[]).includes(tipo)) { extras.push(`tipo original: ${tipo || '(vazio)'}`); tipo = 'Outro'; }
    const t = tipo as TipoEquip;

    // vínculo: e-mail → pessoa; senão o nome casa com uma pessoa; senão vira texto livre
    let pessoaId: string | null = null, vinculoLivre = '';
    if (!TIPOS_LOCAL_FIXO.includes(t)) {
      pessoaId = pessoaPorEmail.get(email(q.atribuidoEmail)) ?? null;
      if (!pessoaId && txt(q.atribuidoA)) {
        pessoaId = pessoaPorNome.get(chaveNome(txt(q.atribuidoA))) ?? null;
        if (!pessoaId) vinculoLivre = txt(q.atribuidoA);
      }
    }
    const temVinculo = !!pessoaId || !!vinculoLivre;
    const vinculadoEm = temVinculo ? (Number.isFinite(Number(q.atribuidoEm)) && q.atribuidoEm ? new Date(Number(q.atribuidoEm)) : null) : null;

    let setorId: string | null = null;
    if (txt(q.centroCusto)) {
      setorId = setorPorChave.get(chaveNome(txt(q.centroCusto))) ?? null;
      if (!setorId) extras.push(`centro de custo: ${txt(q.centroCusto)}`);
    }
    const temIp = TIPOS_COM_IP.includes(t);
    const ipTipo = temIp && (q.ipTipo === 'dhcp' || q.ipTipo === 'fixo') ? q.ipTipo : null;
    const mac = temIp && /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(txt(q.mac).toUpperCase()) ? txt(q.mac).toUpperCase() : null;
    if (txt(q.mac) && !mac) extras.push(`MAC: ${txt(q.mac)}`);
    const garantiaAte = dataSimples(q.garantia), dataAtivacao = dataSimples(q.dataAtivacao);
    if (txt(q.garantia) && !garantiaAte) extras.push(`garantia: ${txt(q.garantia)}`);
    if (txt(q.dataAtivacao) && !dataAtivacao) extras.push(`ativação: ${txt(q.dataAtivacao)}`);
    const situacao = (SITUACOES as readonly string[]).includes(txt(q.situacao)) ? (txt(q.situacao) as EquipNovo['situacao']) : 'ativo';

    const antigos = Object.entries(q).filter(([k, v]) => !CAMPOS_EQUIP.has(k) && !IGNORAR.has(k) && txt(v));
    for (const [k, v] of antigos) extras.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : txt(v)}`);
    if (extras.length) avisos.push(`Equipamento ${codigo}: ${extras.join('; ')} (guardado em Observações).`);

    dados.push({
      origem: codigo, codigo, tipo, modelo: txt(q.modelo), patrimonio: txt(q.patrimonio), serie: txt(q.serie), situacao,
      somenteCadastro: q.somenteCadastro === true, pessoaId, vinculoLivre, vinculadoEm, setorId,
      ipTipo, ip: ipTipo === 'fixo' ? txt(q.ip) || null : null, mac, numeroCorp: tel(q.numero), numeroPart: tel(q.numeroPart),
      tipoChip: txt(q.tipoChip), termoStatus: q.termoAssinado === true ? 'assinado' : q.termoAssinado === false ? 'nao_assinado' : 'nao_informado',
      termoObs: txt(q.termoObs), garantiaAte, predio: txt(q.predio), pontoRede: txt(q.pontoRede), firmware: txt(q.firmware),
      trocasCabeca: Number.isInteger(Number(q.trocasCabeca)) && q.trocasCabeca !== null && q.trocasCabeca !== '' ? Number(q.trocasCabeca) : null,
      licencas: Array.isArray(q.licencas) ? q.licencas.map((l: Doc) => ({ nome: txt(l?.nome), chave: txt(l?.chave) })).filter((l: { nome: string; chave: string }) => l.nome || l.chave) : [],
      dataAtivacao, obs: [txt(q.obs), ...extras].filter(Boolean).join('\n'),
    });
  }
  return { dados, avisos };
}

// ---------- empréstimos ----------
export type EmpNovo = {
  origem: string; equipamentoId: string; pessoaId: string; tecnicoId: string | null; finalidade: string; finalidadeOutra: string;
  chamadoGlpi: string; retiradaEm: Date; previsaoEm: Date | null; devolvidoEm: Date | null; acessorios: string[];
  acessoriosDevolvidos: string[]; acessoriosFaltando: string[]; assinaturaRetirada: string | null; assinaturaDevolucao: string | null;
  obs: string; obsDevolucao: string;
};

export function mapearEmprestimos(emps: Doc[], equipPorCodigo: Map<string, string>, pessoaPorEmail: Map<string, string>) {
  const validos: EmpNovo[] = [], ignorados: Ignorado[] = [], avisos: string[] = [];
  for (const e of emps) {
    const id = txt(e.id) || '(sem id)';
    const equipamentoId = equipPorCodigo.get(txt(e.equipamento).toLowerCase());
    if (!equipamentoId) { ignorados.push({ area: 'emprestimos', id, motivo: `equipamento ${txt(e.equipamento) || '(vazio)'} não está no backup` }); continue; }
    const pessoaId = pessoaPorEmail.get(email(e.email));
    if (!pessoaId) { ignorados.push({ area: 'emprestimos', id, motivo: `pessoa ${email(e.email) || '(sem e-mail)'} não está no backup` }); continue; }
    const retiradaEm = dataHoraSP(e.dataEmprestimo ?? e.dataSaida, e.horaEmprestimo);
    if (!retiradaEm) { ignorados.push({ area: 'emprestimos', id, motivo: 'sem data de retirada' }); continue; }
    const assin = (v: unknown, qual: string) => {
      const img = imagemPng(v);
      if (!img && txt(v)) avisos.push(`Empréstimo ${id}: assinatura da ${qual} marcada, mas sem a imagem; ficou sem assinatura.`);
      return img;
    };
    validos.push({
      origem: id, equipamentoId, pessoaId, tecnicoId: pessoaPorEmail.get(email(e.tecnicoEmail)) ?? null,
      finalidade: txt(e.finalidade) || 'Outra', finalidadeOutra: txt(e.finalidadeOutra) || (txt(e.finalidade) ? '' : 'não informada no sistema antigo'),
      chamadoGlpi: txt(e.chamado).replace(/\D/g, ''), retiradaEm,
      previsaoEm: dataHoraSP(e.dataPrevisao, e.horaPrevisao, '23:59'), devolvidoEm: dataHoraSP(e.dataDevolucao, e.horaDevolucao),
      acessorios: lista(e.acessorios), acessoriosDevolvidos: lista(e.acessoriosDevolvidos), acessoriosFaltando: lista(e.acessoriosFaltando),
      assinaturaRetirada: assin(e.assinaturaEmprestimo, 'retirada'), assinaturaDevolucao: assin(e.assinaturaDevolucao, 'devolução'),
      obs: txt(e.obs), obsDevolucao: txt(e.obsDevolucao),
    });
  }
  // o banco aceita só um empréstimo aberto por equipamento: fica o mais recente
  const abertoMaisRecente = new Map<string, EmpNovo>();
  for (const e of validos.filter((x) => !x.devolvidoEm)) {
    const atual = abertoMaisRecente.get(e.equipamentoId);
    if (!atual || e.retiradaEm > atual.retiradaEm) abertoMaisRecente.set(e.equipamentoId, e);
  }
  const dados = validos.filter((e) => {
    if (e.devolvidoEm || abertoMaisRecente.get(e.equipamentoId) === e) return true;
    ignorados.push({ area: 'emprestimos', id: e.origem, motivo: `o equipamento tem outro empréstimo aberto mais recente (${abertoMaisRecente.get(e.equipamentoId)!.origem})` });
    return false;
  });
  return { dados, ignorados, avisos };
}

// ---------- configuração ----------
export function mapearConfig(cfg: Doc | null | undefined): Partial<ConfigNucleo> {
  if (!cfg) return {};
  const candidato: Doc = {
    tiposEmprestaveis: Array.isArray(cfg.tiposEmprestaveis) ? cfg.tiposEmprestaveis.map((x: unknown) => tipoNovo(txt(x))).filter((x: string) => (TIPOS_EQUIP as readonly string[]).includes(x)) : undefined,
    acessorios: cfg.acessorios, finalidades: cfg.finalidades, bloqueioAtraso: cfg.bloqueioAtraso,
    assinaturas: cfg.assinaturas, glpiUrl: cfg.glpiUrl, avisoMin: cfg.avisoMin,
  };
  const forma = configNucleoSchema.shape;
  return Object.fromEntries(
    Object.entries(candidato)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, forma[k as keyof typeof forma].safeParse(v)] as const)
      .filter(([, r]) => r.success)
      .map(([k, r]) => [k, (r as { data: unknown }).data]),
  ) as Partial<ConfigNucleo>;
}
