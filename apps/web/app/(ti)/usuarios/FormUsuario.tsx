'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePode } from '@/lib/usePode';
import type { Equipamento, Pessoa, Setor } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { CampoAssinatura } from '@/components/CampoAssinatura';

// Reduz a foto para 256 px (lado maior) em JPEG, como no app atual.
async function reduzirFoto(arq: File): Promise<string> {
  const img = await createImageBitmap(arq);
  const k = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export function FormUsuario({ pessoa, onFechar }: { pessoa?: Pessoa; onFechar: () => void }) {
  const [f, setF] = useState({
    nome: pessoa?.nome ?? '', email: '', setorId: pessoa?.setorId ?? '', telefoneCorp: pessoa?.telefoneCorp ?? '',
    telefonePart: pessoa?.telefonePart ?? '', login: pessoa?.login ?? '',
  });
  const [foto, setFoto] = useState<string | undefined>();
  const [apagarFoto, setApagarFoto] = useState(false);
  const [assinatura, setAssinatura] = useState<string | undefined>();
  const [apagarAssinatura, setApagarAssinatura] = useState(false);
  const [variosEq, setVariosEq] = useState(() => Object.values(pessoa?.limites ?? {}).some((n) => n > 1));
  const [limites, setLimites] = useState<Record<string, number>>(pessoa?.limites ?? {});
  const [equipamentos, setEquipamentos] = useState(pessoa?.equipamentos ?? []);
  const [codigoVincular, setCodigoVincular] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const podeVincular = usePode('equipamentos');
  const { data: setores } = useQuery({ queryKey: ['setores'], queryFn: () => api<{ itens: Setor[] }>('/setores') });
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api<{ tiposEmprestaveis: string[] }>('/config'), enabled: !!pessoa });
  const mudar = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({}); setSalvando(true);
    const corpo = {
      nome: f.nome, setorId: f.setorId, telefoneCorp: f.telefoneCorp, telefonePart: f.telefonePart, login: f.login,
      ...(foto ? { foto } : apagarFoto ? { apagarFoto: true } : {}),
      ...(assinatura ? { assinatura } : apagarAssinatura ? { apagarAssinatura: true } : {}),
    };
    try {
      if (pessoa) {
        const lims = Object.fromEntries((config?.tiposEmprestaveis ?? []).map((t) => [t, variosEq ? limites[t] ?? 1 : 1]));
        await api(`/pessoas/${pessoa.id}`, { metodo: 'PATCH', corpo: { ...corpo, limites: lims } });
      } else {
        await api('/pessoas', { metodo: 'POST', corpo: { ...corpo, email: f.email } });
      }
      await qc.invalidateQueries({ queryKey: ['pessoas'] });
      avisar(pessoa ? 'Usuário atualizado.' : 'Usuário cadastrado.');
      onFechar();
    } catch (e) {
      const ea = e instanceof ErroApi ? e : null;
      setErros({ [ea?.campo ?? '_']: ea?.mensagem ?? 'Não foi possível salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  async function vincular(eqId: string, pessoaId: string | null) {
    await api(`/equipamentos/${eqId}/vincular`, { metodo: 'POST', corpo: { pessoaId } });
    await qc.invalidateQueries({ queryKey: ['equipamentos'] });
    await qc.invalidateQueries({ queryKey: ['pessoas'] });
  }
  async function soltar(eq: { id: string; codigo: string }) {
    try {
      await vincular(eq.id, null);
      setEquipamentos((l) => l.filter((x) => x.id !== eq.id));
      avisar(`${eq.codigo} desvinculado.`);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível desvincular.');
    }
  }
  async function vincularCodigo() {
    const cod = codigoVincular.trim();
    if (!cod || !pessoa) return;
    try {
      const r = await api<{ itens: Equipamento[] }>(`/equipamentos?q=${encodeURIComponent(cod)}`);
      const eq = r.itens.find((x) => x.codigo.toLowerCase() === cod.toLowerCase());
      if (!eq) return setErros({ vincular: `Equipamento ${cod} não encontrado.` });
      await vincular(eq.id, pessoa.id);
      setEquipamentos((l) => [...l, { id: eq.id, codigo: eq.codigo, tipo: eq.tipo }]);
      setCodigoVincular(''); setErros({});
      avisar(`${eq.codigo} vinculado.`);
    } catch (e) {
      setErros({ vincular: e instanceof ErroApi ? e.mensagem : 'Não foi possível vincular.' });
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="Nome" erro={erros.nome}><input className="campo" value={f.nome} onChange={(e) => mudar('nome', e.target.value)} required /></Campo>
      {!pessoa && (
        <Campo rotulo="E-mail" erro={erros.email}>
          <input className="campo" value={f.email} onChange={(e) => mudar('email', e.target.value)} placeholder="nome.sobrenome (o @suinco.com.br entra sozinho)" required />
        </Campo>
      )}
      <Campo rotulo="Setor" erro={erros.setorId}>
        <select className="campo" value={f.setorId} onChange={(e) => mudar('setorId', e.target.value)} required>
          <option value="">Escolha...</option>
          {setores?.itens.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Telefone corporativo" erro={erros.telefoneCorp}><input className="campo" value={f.telefoneCorp} onChange={(e) => mudar('telefoneCorp', e.target.value)} placeholder="(34) 99999-9999" /></Campo>
      <Campo rotulo="Telefone particular" erro={erros.telefonePart}><input className="campo" value={f.telefonePart} onChange={(e) => mudar('telefonePart', e.target.value)} placeholder="(34) 99999-9999" /></Campo>
      <Campo rotulo="Login" erro={erros.login}><input className="campo" value={f.login} onChange={(e) => mudar('login', e.target.value)} /></Campo>

      <div className="sm:col-span-2">
        <Campo rotulo="Foto" erro={erros.foto}>
          <input type="file" accept="image/png,image/jpeg" className="campo" onChange={async (e) => {
            const a = e.target.files?.[0];
            if (a) { setFoto(await reduzirFoto(a)); setApagarFoto(false); }
          }} />
        </Campo>
        {pessoa?.temFoto && !foto && !apagarFoto && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/pessoas/${pessoa.id}/foto`} alt={`Foto de ${pessoa.nome}`} className="h-16 w-16 rounded-full object-cover" />
            <button type="button" className="link text-sm" onClick={() => setApagarFoto(true)}>Apagar foto</button>
          </div>
        )}
      </div>

      {pessoa?.tecnico && (
        <div className="sm:col-span-2">
          {pessoa.temAssinatura && !apagarAssinatura && !assinatura && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/pessoas/${pessoa.id}/assinatura`} alt="Assinatura atual" className="h-16 rounded border bg-white" />
              <button type="button" className="link text-sm" onClick={() => setApagarAssinatura(true)}>Apagar assinatura</button>
            </div>
          )}
          <CampoAssinatura rotulo="Assinatura" onChange={setAssinatura} />
          {erros.assinatura && <span className="text-sm text-[var(--late)]">{erros.assinatura}</span>}
        </div>
      )}

      {pessoa && (
        <fieldset className="sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={variosEq} onChange={(e) => setVariosEq(e.target.checked)} /> Pode ter mais de um equipamento de empréstimo</label>
          {variosEq && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {config?.tiposEmprestaveis.map((t) => (
                <Campo key={t} rotulo={`Quantos ${t}`} erro={erros.limites}>
                  <input type="number" min={1} max={50} className="campo" value={limites[t] ?? 1} onChange={(e) => setLimites((l) => ({ ...l, [t]: Number(e.target.value) }))} />
                </Campo>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {pessoa && (
        <section className="sm:col-span-2" aria-label="Equipamentos vinculados">
          <h3 className="rotulo">Equipamentos vinculados</h3>
          {!equipamentos.length && <p className="meta">Nenhum equipamento vinculado.</p>}
          <ul className="space-y-1">
            {equipamentos.map((eq) => (
              <li key={eq.id} className="flex items-center gap-3">
                <span><b>{eq.codigo}</b> <span className="meta">{eq.tipo}</span></span>
                {podeVincular && <button type="button" className="link text-sm" onClick={() => soltar(eq)}>Soltar</button>}
              </li>
            ))}
          </ul>
          {podeVincular && (
            <div className="mt-2 flex items-end gap-2">
              <Campo rotulo="Vincular equipamento (nome)" erro={erros.vincular} className="flex-1">
                <input className="campo" value={codigoVincular} onChange={(e) => setCodigoVincular(e.target.value)} placeholder="DESK-01" />
              </Campo>
              <button type="button" className="btn ghost" onClick={vincularCodigo}>Vincular</button>
            </div>
          )}
        </section>
      )}

      {erros._ && <p role="alert" className="text-[var(--late)] sm:col-span-2">{erros._}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn" disabled={salvando}>Salvar</button>
      </div>
    </form>
  );
}
