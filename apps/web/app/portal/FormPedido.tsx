'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dentroExpediente, proximoUtil, textoExpediente } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { dataHoraBR, type Config } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { CampoAssinatura } from '@/components/CampoAssinatura';
import { paraCampo, deCampo } from '../(ti)/em-uso/datas';
import type { MeuPedido } from './MinhasSolicitacoes';

type Telefones = { corp: string | null; part: string | null };
// retirada sugerida: daqui a 20 min, arredondada para 5 min (como no app atual)
const retiradaPadrao = () => { const m = new Date(Date.now() + 20 * 60_000); m.setMinutes(Math.ceil(m.getMinutes() / 5) * 5, 0, 0); return m; };

export function AvisoExpediente({ config }: { config: Config }) {
  const e = config.expediente;
  if (!e.ligado) return null;
  const agora = new Date(), aberto = dentroExpediente(e, agora), pu = proximoUtil(e, agora);
  return (
    <p className="card text-sm">
      <b>Atendimento da TI: {textoExpediente(e)}.</b><br />
      {aberto ? 'Seu pedido é analisado no horário de expediente.'
        : `A TI está fora do expediente agora. Você pode enviar o pedido normalmente: ele fica guardado e é analisado a partir de ${pu ? dataHoraBR(pu.toISOString()) : 'o próximo horário útil'}.`}
      {' '}A retirada e a devolução só podem ser marcadas dentro do expediente, depois da aprovação.
    </p>
  );
}

export function FormPedido({ config, telefones, editando, onFimEdicao }: { config: Config; telefones: Telefones; editando: MeuPedido | null; onFimEdicao: () => void }) {
  const e = editando;
  const [urgente, setUrgente] = useState(e?.urgente ?? false);
  const [tipo, setTipo] = useState(e?.tipo ?? config.tiposEmprestaveis[0] ?? '');
  const [justificativa, setJustificativa] = useState(e?.justificativa ?? '');
  const [finalidade, setFinalidade] = useState(e && !e.urgente ? e.finalidade : '');
  const [finalidadeOutra, setFinalidadeOutra] = useState(e?.finalidadeOutra ?? '');
  const [chamadoGlpi, setChamadoGlpi] = useState(e?.chamadoGlpi ?? '');
  const [retirada, setRetirada] = useState(paraCampo(e ? new Date(e.retiradaEm) : retiradaPadrao()));
  const [devolucao, setDevolucao] = useState(e?.devolucaoEm ? paraCampo(new Date(e.devolucaoEm)) : `${paraCampo(new Date()).slice(0, 10)}T17:00`);
  const [acessorios, setAcessorios] = useState<string[]>(e?.acessorios ?? []);
  const [obs, setObs] = useState(e?.obs ?? '');
  const temCadastro = !!(telefones.corp || telefones.part);
  const [conferem, setConferem] = useState<boolean | undefined>(undefined);
  const [telCorp, setTelCorp] = useState(e?.telefoneCorp ?? '');
  const [telPart, setTelPart] = useState(e?.telefonePart ?? '');
  const [assinatura, setAssinatura] = useState<string | undefined>();
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();

  const limpar = () => {
    setJustificativa(''); setChamadoGlpi(''); setObs(''); setConferem(undefined); setTelCorp(''); setTelPart(''); setAssinatura(undefined); setErros({});
  };
  async function enviar(confirmarRepetido = false): Promise<void> {
    const tels = conferem === true ? { telefonesConferem: true } : { ...(temCadastro && { telefonesConferem: false }), telefoneCorp: telCorp, telefonePart: telPart };
    const corpo = urgente
      ? { urgente: true, tipo, justificativa, ...tels, ...(assinatura && { assinatura }) }
      : {
        urgente: false, tipo, finalidade, finalidadeOutra, chamadoGlpi, retiradaEm: deCampo(retirada).toISOString(), devolucaoEm: deCampo(devolucao).toISOString(),
        acessorios, obs, ...tels, ...(assinatura && { assinatura }), ...(confirmarRepetido && { confirmarRepetido: true }),
      };
    try {
      if (e) await api(`/pedidos/${e.id}`, { metodo: 'PATCH', corpo });
      else await api('/pedidos', { metodo: 'POST', corpo });
      await qc.invalidateQueries({ queryKey: ['pedidos'] });
      avisar(e ? 'Pedido atualizado.' : urgente ? 'Pedido URGENTE enviado direto para aprovação.' : 'Solicitação enviada! Acompanhe abaixo.');
      limpar();
      if (e) onFimEdicao();
    } catch (err) {
      if (!(err instanceof ErroApi)) throw err;
      if (err.codigo === 'repetido') {
        if (await perguntar(err.mensagem, 'Enviar mesmo assim')) return enviar(true);
        return;
      }
      setErros({ [err.campo ?? '_']: err.mensagem });
    }
  }
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({}); setEnviando(true);
    try { await enviar(); } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={salvar} className="card grid gap-3 sm:grid-cols-2" noValidate>
      <div role="group" aria-label="Tipo de pedido" className="flex gap-2 sm:col-span-2">
        <button type="button" aria-pressed={!urgente} className={`chip ${!urgente ? 'ativo' : ''}`} onClick={() => setUrgente(false)}>Normal</button>
        <button type="button" aria-pressed={urgente} className={`chip late ${urgente ? 'ativo' : ''}`} onClick={() => setUrgente(true)}>Urgente</button>
      </div>
      <Campo rotulo="Equipamento" erro={erros.tipo}>
        <select className="campo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>
          {config.tiposEmprestaveis.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Campo>

      {urgente ? (
        <Campo rotulo="Por que é urgente?" erro={erros.justificativa} className="sm:col-span-2">
          <textarea className="campo" rows={2} value={justificativa} onChange={(ev) => setJustificativa(ev.target.value)} />
        </Campo>
      ) : (
        <>
          <Campo rotulo="Chamado GLPI" erro={erros.chamadoGlpi}>
            <input className="campo" inputMode="numeric" value={chamadoGlpi} onChange={(ev) => setChamadoGlpi(ev.target.value.replace(/\D/g, ''))} />
          </Campo>
          <div role="group" aria-label="Finalidade" className="sm:col-span-2">
            <span className="rotulo">Finalidade</span>
            <div className="flex flex-wrap gap-2">
              {config.finalidades.map((f) => (
                <button key={f.nome} type="button" aria-pressed={finalidade === f.nome} className={`chip ${finalidade === f.nome ? 'ativo' : ''}`} onClick={() => setFinalidade(f.nome)}>{f.nome}</button>
              ))}
            </div>
            {erros.finalidade && <span className="text-sm text-[var(--late)]">{erros.finalidade}</span>}
          </div>
          {finalidade === 'Outra' && (
            <Campo rotulo="Motivo" erro={erros.finalidadeOutra} className="sm:col-span-2"><input className="campo" value={finalidadeOutra} onChange={(ev) => setFinalidadeOutra(ev.target.value)} /></Campo>
          )}
          <Campo rotulo="Retirada" erro={erros.retiradaEm}><input type="datetime-local" className="campo" value={retirada} onChange={(ev) => setRetirada(ev.target.value)} /></Campo>
          <Campo rotulo="Devolução" erro={erros.devolucaoEm}><input type="datetime-local" className="campo" value={devolucao} onChange={(ev) => setDevolucao(ev.target.value)} /></Campo>
          <fieldset className="sm:col-span-2">
            <legend className="rotulo">Acessórios</legend>
            <div className="flex flex-wrap gap-4">
              {config.acessorios.map((a) => (
                <label key={a} className="flex items-center gap-2">
                  <input type="checkbox" checked={acessorios.includes(a)} onChange={(ev) => setAcessorios((l) => (ev.target.checked ? [...l, a] : l.filter((x) => x !== a)))} /> {a}
                </label>
              ))}
            </div>
          </fieldset>
          <Campo rotulo="Observação" className="sm:col-span-2"><textarea className="campo" rows={2} value={obs} onChange={(ev) => setObs(ev.target.value)} /></Campo>
        </>
      )}

      <fieldset className="sm:col-span-2">
        <legend className="rotulo">Seus telefones</legend>
        {temCadastro && (
          <>
            <p className="text-sm">{[telefones.corp && `Corporativo: ${telefones.corp}`, telefones.part && `Particular: ${telefones.part}`].filter(Boolean).join(' · ')}</p>
            <div role="group" aria-label="Os telefones estão certos?" className="mt-1 flex gap-2">
              <button type="button" aria-pressed={conferem === true} className={`chip ${conferem === true ? 'ativo' : ''}`} onClick={() => setConferem(true)}>Estão certos</button>
              <button type="button" aria-pressed={conferem === false} className={`chip ${conferem === false ? 'ativo' : ''}`} onClick={() => setConferem(false)}>Corrigir</button>
            </div>
            {erros.telefonesConferem && <span className="text-sm text-[var(--late)]">{erros.telefonesConferem}</span>}
          </>
        )}
        {(!temCadastro || conferem === false) && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Telefone corporativo" erro={erros.telefoneCorp}><input className="campo" value={telCorp} onChange={(ev) => setTelCorp(ev.target.value)} placeholder="(34) 99999-9999" /></Campo>
            <Campo rotulo="Telefone particular" erro={erros.telefonePart}><input className="campo" value={telPart} onChange={(ev) => setTelPart(ev.target.value)} placeholder="(34) 99999-9999" /></Campo>
          </div>
        )}
      </fieldset>

      {config.assinaturas && (
        <div className="sm:col-span-2">
          {e?.temAssinatura && <p className="meta text-sm">Assinatura enviada com o pedido. Assine abaixo só para trocar.</p>}
          <CampoAssinatura rotulo="Sua assinatura" onChange={setAssinatura} />
          {erros.assinatura && <span className="text-sm text-[var(--late)]">{erros.assinatura}</span>}
        </div>
      )}
      {erros._ && <p role="alert" className="whitespace-pre-line text-[var(--late)] sm:col-span-2">{erros._}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {e && <button type="button" className="btn ghost" onClick={() => { limpar(); onFimEdicao(); }}>Cancelar edição</button>}
        <button className={`btn ${urgente ? 'perigo' : ''}`} disabled={enviando}>
          {e ? 'Salvar alterações do pedido' : urgente ? 'Enviar pedido urgente' : 'Enviar solicitação'}
        </button>
      </div>
    </form>
  );
}
