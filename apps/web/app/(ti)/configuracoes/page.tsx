'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TIPOS_EQUIP } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import type { Config } from '@/lib/tipos';
import { Campo } from '@/components/Campo';

function FormConfig({ inicial }: { inicial: Config }) {
  const [c, setC] = useState<Config>(inicial);
  const [novoAcessorio, setNovoAcessorio] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const mudar = <K extends keyof Config>(k: K, v: Config[K]) => setC((x) => ({ ...x, [k]: v }));
  const mudarFin = (i: number, m: Partial<Config['finalidades'][number]>) => mudar('finalidades', c.finalidades.map((f, j) => (j === i ? { ...f, ...m } : f)));

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({}); setSalvando(true);
    try {
      await api('/config', { metodo: 'PATCH', corpo: c });
      await qc.invalidateQueries({ queryKey: ['config'] });
      avisar('Configurações salvas.');
    } catch (e) {
      const ea = e instanceof ErroApi ? e : null;
      setErros({ [ea?.campo?.split('.')[0] ?? '_']: ea?.mensagem ?? 'Não foi possível salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="max-w-3xl space-y-6">
      <fieldset className="card">
        <legend className="rotulo px-1">Tipos de equipamento de empréstimo</legend>
        <div className="grid gap-1 sm:grid-cols-3">
          {TIPOS_EQUIP.map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="checkbox" checked={c.tiposEmprestaveis.includes(t)} onChange={(e) => mudar('tiposEmprestaveis', e.target.checked ? [...c.tiposEmprestaveis, t] : c.tiposEmprestaveis.filter((x) => x !== t))} /> {t}
            </label>
          ))}
        </div>
        {erros.tiposEmprestaveis && <p className="text-sm text-[var(--late)]">{erros.tiposEmprestaveis}</p>}
      </fieldset>

      <fieldset className="card">
        <legend className="rotulo px-1">Acessórios</legend>
        <ul className="flex flex-wrap gap-2">
          {c.acessorios.map((a) => (
            <li key={a} className="chip">{a} <button type="button" className="ml-1" aria-label={`Remover ${a}`} onClick={() => mudar('acessorios', c.acessorios.filter((x) => x !== a))}>✕</button></li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input className="campo" aria-label="Novo acessório" placeholder="Novo acessório" value={novoAcessorio} onChange={(e) => setNovoAcessorio(e.target.value)} />
          <button type="button" className="btn ghost" onClick={() => {
            const a = novoAcessorio.trim();
            if (a && !c.acessorios.includes(a)) mudar('acessorios', [...c.acessorios, a]);
            setNovoAcessorio('');
          }}>Adicionar</button>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="rotulo px-1">Finalidades (prazo sugerido para a devolução)</legend>
        <div className="space-y-2">
          {c.finalidades.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className="campo w-48" aria-label={`Finalidade ${i + 1}: nome`} value={f.nome} onChange={(e) => mudarFin(i, { nome: e.target.value })} />
              <input type="number" min={0} max={365} className="campo w-20" aria-label={`Finalidade ${i + 1}: dias`} value={f.dias} onChange={(e) => mudarFin(i, { dias: Number(e.target.value) })} />
              <span className="meta">dia(s), às</span>
              <input type="time" className="campo w-28" aria-label={`Finalidade ${i + 1}: hora`} value={f.hora} onChange={(e) => mudarFin(i, { hora: e.target.value })} />
              <button type="button" className="link text-sm" onClick={() => mudar('finalidades', c.finalidades.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
        </div>
        <button type="button" className="link mt-2 text-sm" onClick={() => mudar('finalidades', [...c.finalidades, { nome: '', dias: 0, hora: '17:00' }])}>Adicionar finalidade</button>
        {erros.finalidades && <p className="text-sm text-[var(--late)]">{erros.finalidades}</p>}
      </fieldset>

      <fieldset className="card space-y-2">
        <legend className="rotulo px-1">Regras</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.bloqueioAtraso} onChange={(e) => mudar('bloqueioAtraso', e.target.checked)} /> Bloquear novos empréstimos de quem está em atraso</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={c.assinaturas} onChange={(e) => mudar('assinaturas', e.target.checked)} /> Exigir assinaturas na retirada e na devolução</label>
        <Campo rotulo="Avisar quantos minutos antes de vencer" erro={erros.avisoMin}>
          <input type="number" min={5} className="campo w-32" value={c.avisoMin} onChange={(e) => mudar('avisoMin', Number(e.target.value))} />
        </Campo>
        <Campo rotulo="Endereço do GLPI" erro={erros.glpiUrl}>
          <input className="campo" value={c.glpiUrl} onChange={(e) => mudar('glpiUrl', e.target.value)} placeholder="https://glpi.suinco.com.br/front/ticket.form.php?id=" />
        </Campo>
        <p className="meta text-sm">O número do chamado entra no fim do endereço.</p>
      </fieldset>

      {erros._ && <p role="alert" className="text-[var(--late)]">{erros._}</p>}
      <div className="flex justify-end"><button className="btn" disabled={salvando}>Salvar</button></div>
    </form>
  );
}

export default function Configuracoes() {
  const q = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') });
  const [versao, setVersao] = useState(0);
  // quando outra pessoa salva (aviso em tempo real), recarrega o formulário
  useEffect(() => { setVersao((v) => v + 1); }, [q.dataUpdatedAt]);
  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Configurações</h1>
      {q.isError && <p role="alert" className="text-[var(--late)]">Não foi possível carregar as configurações.</p>}
      {q.data && <FormConfig key={versao} inicial={q.data} />}
    </section>
  );
}
