'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { diaSP, horaSP } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import type { Config, Reserva } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { SeletorPessoa, type PessoaResumo } from '@/components/SeletorPessoa';
import { SeletorEquipamento } from '@/components/SeletorEquipamento';
import { paraCampo, deCampo } from '../em-uso/datas';

const amanha = () => diaSP(new Date(Date.now() + 86_400_000));
const emSP = (dia: string, hora: string) => (dia && hora ? new Date(`${dia}T${hora}:00-03:00`) : null);

export function FormReserva({ reserva, config, onFechar }: { reserva?: Reserva; config: Config; onFechar: () => void }) {
  const ini = reserva ? new Date(reserva.inicioEm) : null, fimR = reserva ? new Date(reserva.fimEm) : null;
  // reserva de vários dias: o fim gravado é a devolução prevista
  const variosDias = !!ini && !!fimR && diaSP(ini) !== diaSP(fimR);
  const [pessoa, setPessoa] = useState<PessoaResumo | null>(reserva ? { id: reserva.pessoa.id, nome: reserva.pessoa.nome, email: reserva.pessoa.email } : null);
  const [data, setData] = useState(ini ? diaSP(ini) : amanha());
  const [inicio, setInicio] = useState(ini ? horaSP(ini) : '08:00');
  const [fim, setFim] = useState(fimR && !variosDias ? horaSP(fimR) : '17:00');
  const [devolucao, setDevolucao] = useState(variosDias && fimR ? paraCampo(fimR) : '');
  const [equipamentoId, setEquipamentoId] = useState(reserva?.equipamento.id ?? '');
  const [finalidade, setFinalidade] = useState(reserva?.finalidade ?? '');
  const [finalidadeOutra, setFinalidadeOutra] = useState(reserva?.finalidadeOutra ?? '');
  const [chamadoGlpi, setChamadoGlpi] = useState(reserva?.chamadoGlpi ?? '');
  const [obs, setObs] = useState(reserva?.obs ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const ehMaster = usePode('excluir');
  const inicioEm = emSP(data, inicio), fimEm = emSP(data, fim), devolucaoEm = devolucao ? deCampo(devolucao) : null;

  async function enviar(extra: { liberarAtraso?: boolean; liberarLimite?: boolean } = {}): Promise<void> {
    const corpo = {
      pessoaId: pessoa?.id ?? '', equipamentoId, inicioEm: inicioEm?.toISOString(), fimEm: fimEm?.toISOString(),
      devolucaoEm: devolucaoEm?.toISOString() ?? null, finalidade, finalidadeOutra, chamadoGlpi, obs, ...(!reserva && extra),
    };
    try {
      if (reserva) await api(`/reservas/${reserva.id}`, { metodo: 'PATCH', corpo });
      else await api('/reservas', { metodo: 'POST', corpo });
      await Promise.all(['reservas', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar(reserva ? 'Reserva atualizada.' : 'Reserva criada.');
      onFechar();
    } catch (e) {
      if (!(e instanceof ErroApi)) throw e;
      if (e.codigo === 'atraso' || e.codigo === 'limite') {
        if (!ehMaster) return setErros({ _: `${e.mensagem}${e.codigo === 'limite' ? ' Peça para devolver um item antes, ou peça ao Administrador Master para liberar.' : ''}` });
        const atraso = e.codigo === 'atraso';
        const texto = atraso
          ? `${e.mensagem}\n\nComo Administrador Master, você pode liberar esta reserva.\n\nContinuar mesmo assim?`
          : `${e.mensagem}\n\nComo Administrador Master, você pode liberar esta exceção. Para liberar sempre, marque "Pode ter mais de um equipamento de empréstimo" em Editar usuário.`;
        if (await perguntar(texto, atraso ? 'Liberar mesmo assim' : 'Liberar exceção')) return enviar({ ...extra, [atraso ? 'liberarAtraso' : 'liberarLimite']: true });
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
      <div className="sm:col-span-2"><SeletorPessoa rotulo="Colaborador" valor={pessoa} onChange={setPessoa} erro={erros.pessoaId} /></div>
      <Campo rotulo="Data" erro={erros.inicioEm}><input type="date" className="campo" value={data} min={diaSP(new Date())} onChange={(e) => setData(e.target.value)} required /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Início"><input type="time" className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></Campo>
        <Campo rotulo="Fim" erro={erros.fimEm}><input type="time" className="campo" value={fim} onChange={(e) => setFim(e.target.value)} required /></Campo>
      </div>
      <Campo rotulo="Devolução prevista (se passar do dia)" erro={erros.devolucaoEm} className="sm:col-span-2">
        <input type="datetime-local" className="campo" value={devolucao} onChange={(e) => setDevolucao(e.target.value)} />
      </Campo>
      <div className="sm:col-span-2">
        <SeletorEquipamento inicio={inicioEm} fim={devolucaoEm ?? fimEm} valor={equipamentoId} onChange={setEquipamentoId} ignorarReserva={reserva?.id} tipoPreferido={config.tiposEmprestaveis[0]} erro={erros.equipamentoId} />
      </div>
      <div role="group" aria-label="Finalidade" className="sm:col-span-2">
        <span className="rotulo">Finalidade</span>
        <div className="flex flex-wrap gap-2">
          {config.finalidades.map((f) => (
            <button key={f.nome} type="button" aria-pressed={finalidade === f.nome} className={`chip ${finalidade === f.nome ? 'ativo' : ''}`}
              onClick={() => setFinalidade(finalidade === f.nome ? '' : f.nome)}>{f.nome}</button>
          ))}
        </div>
      </div>
      {finalidade === 'Outra' && (
        <Campo rotulo="Motivo da reserva" erro={erros.finalidadeOutra} className="sm:col-span-2"><input className="campo" value={finalidadeOutra} onChange={(e) => setFinalidadeOutra(e.target.value)} /></Campo>
      )}
      <Campo rotulo="Chamado GLPI" erro={erros.chamadoGlpi}><input className="campo" inputMode="numeric" value={chamadoGlpi} onChange={(e) => setChamadoGlpi(e.target.value.replace(/\D/g, ''))} /></Campo>
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="campo" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {erros._ && <p role="alert" className="whitespace-pre-line text-[var(--late)] sm:col-span-2">{erros._}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn" disabled={salvando}>Salvar</button>
      </div>
    </form>
  );
}
