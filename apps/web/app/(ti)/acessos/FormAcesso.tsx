'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOMES_PAPEL, PADRAO_TIC, PAPEIS, PERMISSOES, type Papel, type Permissao } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { Campo } from '@/components/Campo';
import { SeletorPessoa, type PessoaResumo } from '@/components/SeletorPessoa';
import { Permissoes } from './Permissoes';
import type { Acesso, Grupo } from './tipos';

type Marcadas = Partial<Record<Permissao, boolean>>;
const todas = (sim: boolean): Marcadas => Object.fromEntries(PERMISSOES.map((p) => [p, sim]));

export function FormAcesso({ acesso, onFechar, onSenha }: { acesso?: Acesso; onFechar: () => void; onSenha: (senha: string) => void }) {
  const [pessoa, setPessoa] = useState<PessoaResumo | null>(null);
  const [papel, setPapel] = useState<Papel | ''>(acesso?.papel ?? '');
  const [grupoId, setGrupoId] = useState(acesso?.grupo?.id ?? '');
  const [marcadas, setMarcadas] = useState<Marcadas>(acesso?.permissoesMarcadas ?? {});
  const [erros, setErros] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: grupos } = useQuery({ queryKey: ['grupos'], queryFn: () => api<{ itens: Grupo[] }>('/grupos') });
  const grupo = grupos?.itens.find((g) => g.id === grupoId);

  // ao trocar o perfil, sugere as permissões padrão dele
  const mudarPapel = (p: Papel) => {
    setPapel(p);
    setMarcadas(p === 'tic' ? Object.fromEntries(PADRAO_TIC.map((x) => [x, true])) : p === 'master' ? todas(true) : {});
  };
  const fixo = papel === 'master' || papel === 'solicitante';
  const mostradas = grupo ? grupo.permissoes : papel === 'master' ? todas(true) : papel === 'solicitante' ? {} : marcadas;
  const aviso = grupo ? `As permissões vêm do grupo ${grupo.nome}.`
    : papel === 'master' ? 'O Administrador Master tem todas as permissões.'
      : papel === 'solicitante' ? 'O Solicitante só usa o portal.' : undefined;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({});
    const corpo = { papel: papel || undefined, grupoId: fixo ? null : grupoId || null, permissoes: marcadas };
    try {
      if (acesso) {
        await api(`/acessos/${acesso.id}`, { metodo: 'PATCH', corpo });
        avisar('Acesso atualizado.');
      } else {
        const r = await api<{ senhaTemporaria: string }>('/acessos', { metodo: 'POST', corpo: { ...corpo, pessoaId: pessoa?.id } });
        onSenha(r.senhaTemporaria);
      }
      await qc.invalidateQueries({ queryKey: ['acessos'] });
      onFechar();
    } catch (e) {
      const ea = e instanceof ErroApi ? e : null;
      setErros({ [ea?.campo ?? '_']: ea?.mensagem ?? 'Não foi possível salvar.' });
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      {acesso ? <p><b>{acesso.pessoa.nome}</b> <span className="meta">{acesso.pessoa.email}</span></p>
        : <SeletorPessoa rotulo="Pessoa" valor={pessoa} onChange={setPessoa} erro={erros.pessoaId} />}
      {!acesso && <p className="meta text-sm">A pessoa precisa estar cadastrada em Usuários antes.</p>}
      <Campo rotulo="Perfil" erro={erros.papel}>
        <select className="campo" value={papel} onChange={(e) => mudarPapel(e.target.value as Papel)} required>
          <option value="">Escolha...</option>
          {PAPEIS.map((p) => <option key={p} value={p}>{NOMES_PAPEL[p]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Grupo de permissões" erro={erros.grupoId}>
        <select className="campo" value={fixo ? '' : grupoId} onChange={(e) => setGrupoId(e.target.value)} disabled={fixo}>
          <option value="">Nenhum (usar o perfil acima)</option>
          {grupos?.itens.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </Campo>
      <Permissoes valor={mostradas} onChange={setMarcadas} travado={!!grupo || fixo} aviso={aviso} />
      {erros._ && <p role="alert" className="text-[var(--late)]">{erros._}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}
