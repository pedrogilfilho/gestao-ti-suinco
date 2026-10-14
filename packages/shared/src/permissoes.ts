export const PERMISSOES = ['acessos', 'almoxarifado', 'auditoria', 'config', 'emprestar', 'equipamentos', 'excluir', 'reservar', 'usuarios'] as const;
export type Permissao = (typeof PERMISSOES)[number];
export const PAPEIS = ['master', 'tic', 'consulta', 'solicitante'] as const;
export type Papel = (typeof PAPEIS)[number];
export const NOMES_PAPEL: Record<Papel, string> = {
  master: 'Administrador Master', tic: 'Administrador TIC', consulta: 'Somente consulta', solicitante: 'Solicitante',
};
export const NOMES_PERMISSAO: Record<Permissao, string> = {
  acessos: 'Gerenciar acessos', almoxarifado: 'Almoxarifado', auditoria: 'Auditoria', config: 'Configurações',
  emprestar: 'Empréstimos e devoluções', equipamentos: 'Equipamentos', excluir: 'Excluir cadastros',
  reservar: 'Reservas', usuarios: 'Usuários e setores',
};
export const PADRAO_TIC: Permissao[] = ['emprestar', 'reservar', 'equipamentos', 'usuarios', 'auditoria', 'almoxarifado'];

type Marcadas = Partial<Record<Permissao, boolean>>;
export interface AcessoParaPermissao {
  papel: Papel;
  dono: boolean;
  permissoes: Marcadas;
  grupo?: { permissoes: Marcadas } | null;
}

export function permissoesEfetivas(a: AcessoParaPermissao): Set<Permissao> {
  if (a.dono || a.papel === 'master') return new Set(PERMISSOES);
  if (a.papel === 'solicitante') return new Set();
  const fonte = a.grupo ? a.grupo.permissoes : a.permissoes;
  return new Set(PERMISSOES.filter((p) => fonte[p] === true));
}

export function ehEquipeTI(papel: Papel, dono: boolean): boolean {
  return dono || papel !== 'solicitante';
}
