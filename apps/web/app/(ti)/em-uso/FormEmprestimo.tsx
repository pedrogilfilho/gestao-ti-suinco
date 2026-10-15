'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { previsaoSugerida } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useEu } from '@/lib/sessao';
import type { Config, Emprestimo } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { SeletorPessoa, type PessoaResumo } from '@/components/SeletorPessoa';
import { CampoAssinatura } from '@/components/CampoAssinatura';
import { paraCampo, deCampo } from './datas';

type Livre = { id: string; codigo: string; tipo: string; modelo: string; patrimonio: string };
// Empréstimo que nasce de uma reserva ("Registrar retirada") ou de um pedido ("Entregar agora"): já vem preenchido.
export type PresetEmprestimo = {
  equipamento: { id: string; codigo: string; tipo: string }; pessoa: PessoaResumo; finalidade?: string; finalidadeOutra?: string;
  chamadoGlpi?: string; obs?: string; previsaoEm?: string | null; acessorios?: string[]; reservaId?: string; pedidoId?: string; temAssinatura?: boolean;
};

// Registrar (sem `emprestimo`) ou editar um empréstimo.
export function FormEmprestimo({ emprestimo, preset, config, onFechar }: { emprestimo?: Emprestimo; preset?: PresetEmprestimo; config: Config; onFechar: () => void }) {
  const { eu } = useEu();
  const agora = new Date();
  const [equipamentoId, setEquipamentoId] = useState(emprestimo?.equipamento.id ?? preset?.equipamento.id ?? '');
  const [leitor, setLeitor] = useState('');
  const [pessoa, setPessoa] = useState<PessoaResumo | null>(emprestimo ? { id: emprestimo.pessoa.id, nome: emprestimo.pessoa.nome, email: emprestimo.pessoa.email } : preset?.pessoa ?? null);
  const [tecnicoId, setTecnicoId] = useState(emprestimo?.tecnicoId ?? eu?.pessoaId ?? '');
  const [finalidade, setFinalidade] = useState(emprestimo?.finalidade ?? preset?.finalidade ?? '');
  const [finalidadeOutra, setFinalidadeOutra] = useState(emprestimo?.finalidadeOutra ?? preset?.finalidadeOutra ?? '');
  const [retirada, setRetirada] = useState(paraCampo(emprestimo ? new Date(emprestimo.retiradaEm) : agora));
  const [previsao, setPrevisao] = useState(() => { const v = emprestimo?.previsaoEm ?? preset?.previsaoEm; return v ? paraCampo(new Date(v)) : ''; });
  const [previsaoManual, setPrevisaoManual] = useState(!!emprestimo || !!preset?.previsaoEm);
  const [acessorios, setAcessorios] = useState<string[]>(emprestimo?.acessorios ?? preset?.acessorios ?? (preset?.equipamento.tipo.startsWith('Notebook') && config.acessorios.includes('Carregador') ? ['Carregador'] : []));
  const [chamadoGlpi, setChamadoGlpi] = useState(emprestimo?.chamadoGlpi ?? preset?.chamadoGlpi ?? '');
  const [obs, setObs] = useState(emprestimo?.obs ?? preset?.obs ?? '');
  const [assinatura, setAssinatura] = useState<string | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const ehMaster = usePode('excluir');
  const { data: livres } = useQuery({ queryKey: ['equipamentos', 'livres'], queryFn: () => api<Livre[]>('/equipamentos/livres'), enabled: !emprestimo && !preset });
  const { data: tecnicos } = useQuery({ queryKey: ['pessoas', 'tecnicos'], queryFn: () => api<{ itens: PessoaResumo[] }>('/pessoas?tecnico=sim&ativo=sim&limite=100') });

  // previsão sugerida pela finalidade, até a pessoa mexer nela
  const sugerir = (fin: string, ret: string) => {
    const f = config.finalidades.find((x) => x.nome === fin);
    if (f && ret && !previsaoManual) setPrevisao(paraCampo(previsaoSugerida(deCampo(ret), f)));
  };
  const escolherEquip = (id: string) => {
    setEquipamentoId(id);
    const eq = livres?.find((x) => x.id === id);
    // notebook já vem com o carregador marcado
    if (eq?.tipo.startsWith('Notebook') && config.acessorios.includes('Carregador')) setAcessorios((a) => (a.includes('Carregador') ? a : [...a, 'Carregador']));
  };
  const lerCodigo = () => {
    const eq = livres?.find((x) => [x.codigo, x.patrimonio].some((c) => c && c.toLowerCase() === leitor.trim().toLowerCase()));
    if (eq) { escolherEquip(eq.id); setLeitor(''); setErros({}); } else setErros({ leitor: `${leitor} não está disponível para empréstimo.` });
  };

  async function enviar(extra: { liberarLimite?: boolean; confirmarAtraso?: boolean } = {}): Promise<void> {
    const corpo = {
      ...(!emprestimo && { equipamentoId }), ...(preset?.reservaId && { reservaId: preset.reservaId }), ...(preset?.pedidoId && { pedidoId: preset.pedidoId }), pessoaId: pessoa?.id ?? '', tecnicoId: tecnicoId || undefined, finalidade, finalidadeOutra,
      retiradaEm: retirada ? deCampo(retirada).toISOString() : undefined, previsaoEm: previsao ? deCampo(previsao).toISOString() : undefined,
      acessorios, chamadoGlpi, obs, ...(assinatura && { assinatura }),
    };
    try {
      if (emprestimo) await api(`/emprestimos/${emprestimo.id}`, { metodo: 'PATCH', corpo });
      else await api('/emprestimos', { metodo: 'POST', corpo: { ...corpo, ...extra } });
      await Promise.all(['emprestimos', 'equipamentos', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar(emprestimo ? 'Empréstimo atualizado.' : 'Empréstimo registrado.');
      onFechar();
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e;
      if (e.codigo === 'atraso') {
        if (await perguntar(`${e.mensagem}\n\nEntregar outro equipamento mesmo assim?`, 'Entregar mesmo assim')) return enviar({ ...extra, confirmarAtraso: true });
        return;
      }
      if (e.codigo === 'limite') {
        if (!ehMaster) return setErros({ _: `${e.mensagem} Peça para devolver um item antes, ou peça ao Administrador Master para liberar.` });
        if (await perguntar(`${e.mensagem}\n\nComo Administrador Master, você pode liberar esta exceção. Para liberar sempre, marque "Pode ter mais de um equipamento de empréstimo" em Editar usuário.`, 'Liberar exceção'))
          return enviar({ ...extra, liberarLimite: true });
        return;
      }
      setErros({ [e.campo ?? '_']: e.mensagem });
    }
  }
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({}); setSalvando(true);
    try { await enviar(); } finally { setSalvando(false); }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
      {emprestimo || preset ? (
        <p className="sm:col-span-2"><b>{(emprestimo ?? preset)!.equipamento.codigo}</b> <span className="meta">{(emprestimo ?? preset)!.equipamento.tipo}</span></p>
      ) : (
        <>
          <Campo rotulo="Equipamento" erro={erros.equipamentoId}>
            <select className="campo" value={equipamentoId} onChange={(e) => escolherEquip(e.target.value)} required>
              <option value="">Escolha...</option>
              {livres?.map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Leitor de código (nome ou patrimônio + Enter)" erro={erros.leitor}>
            <input className="campo" value={leitor} onChange={(e) => setLeitor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lerCodigo(); } }} />
          </Campo>
        </>
      )}
      <div className="sm:col-span-2"><SeletorPessoa rotulo="Colaborador" valor={pessoa} onChange={setPessoa} erro={erros.pessoaId} /></div>
      <Campo rotulo="Técnico" erro={erros.tecnicoId}>
        <select className="campo" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
          {!tecnicos?.itens.some((t) => t.id === tecnicoId) && <option value={tecnicoId}>{eu?.nome ?? 'Eu'}</option>}
          {tecnicos?.itens.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Chamado GLPI" erro={erros.chamadoGlpi}><input className="campo" inputMode="numeric" value={chamadoGlpi} onChange={(e) => setChamadoGlpi(e.target.value)} /></Campo>

      <div role="group" aria-label="Finalidade" className="sm:col-span-2">
        <span className="rotulo">Finalidade</span>
        <div className="flex flex-wrap gap-2">
          {config.finalidades.map((f) => (
            <button key={f.nome} type="button" aria-pressed={finalidade === f.nome} className={`chip ${finalidade === f.nome ? 'ativo' : ''}`}
              onClick={() => { setFinalidade(f.nome); sugerir(f.nome, retirada); }}>{f.nome}</button>
          ))}
        </div>
        {erros.finalidade && <span className="text-sm text-[var(--late)]">{erros.finalidade}</span>}
      </div>
      {finalidade === 'Outra' && (
        <Campo rotulo="Motivo" erro={erros.finalidadeOutra} className="sm:col-span-2"><input className="campo" value={finalidadeOutra} onChange={(e) => setFinalidadeOutra(e.target.value)} /></Campo>
      )}
      <Campo rotulo="Retirada" erro={erros.retiradaEm}>
        <input type="datetime-local" className="campo" value={retirada} onChange={(e) => { setRetirada(e.target.value); sugerir(finalidade, e.target.value); }} required />
      </Campo>
      <Campo rotulo="Previsão de entrega" erro={erros.previsaoEm}>
        <input type="datetime-local" className="campo" value={previsao} onChange={(e) => { setPrevisao(e.target.value); setPrevisaoManual(true); }} required />
      </Campo>

      <fieldset className="sm:col-span-2">
        <legend className="rotulo">Acessórios</legend>
        <div className="flex flex-wrap gap-4">
          {config.acessorios.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" checked={acessorios.includes(a)} onChange={(e) => setAcessorios((l) => (e.target.checked ? [...l, a] : l.filter((x) => x !== a)))} /> {a}
            </label>
          ))}
        </div>
      </fieldset>
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="campo" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {config.assinaturas && !emprestimo && (
        <div className="sm:col-span-2">
          <CampoAssinatura rotulo="Assinatura do colaborador" onChange={setAssinatura} />
          {erros.assinatura && <span className="text-sm text-[var(--late)]">{erros.assinatura}</span>}
        </div>
      )}

      {erros._ && <p role="alert" className="text-[var(--late)] sm:col-span-2">{erros._}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn" disabled={salvando}>{emprestimo ? 'Salvar' : 'Registrar'}</button>
      </div>
    </form>
  );
}
