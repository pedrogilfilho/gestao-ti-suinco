'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import type { Config, Emprestimo } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { CampoAssinatura } from '@/components/CampoAssinatura';
import { paraCampo, deCampo } from './datas';

// Devolução: o que não voltar fica como pendência (Resolver depois).
export function FormDevolucao({ emprestimo, config, onFechar }: { emprestimo: Emprestimo; config: Config; onFechar: () => void }) {
  const [quando, setQuando] = useState(paraCampo(new Date()));
  const [voltaram, setVoltaram] = useState<string[]>(emprestimo.acessorios);
  const [obsDevolucao, setObs] = useState('');
  const [assinatura, setAssinatura] = useState<string | undefined>();
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();

  async function confirmar(ev: FormEvent) {
    ev.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await api(`/emprestimos/${emprestimo.id}/devolver`, {
        metodo: 'POST', corpo: { devolvidoEm: deCampo(quando).toISOString(), acessoriosDevolvidos: voltaram, obsDevolucao, ...(assinatura && { assinatura }) },
      });
      await Promise.all(['emprestimos', 'equipamentos', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      const faltam = emprestimo.acessorios.filter((a) => !voltaram.includes(a));
      avisar(faltam.length ? `Devolução registrada. Pendente: ${faltam.join(', ')}.` : 'Devolução registrada.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível registrar a devolução.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={confirmar} className="space-y-3">
      <p>{emprestimo.pessoa.nome} <span className="meta">({emprestimo.pessoa.setor})</span></p>
      <Campo rotulo="Devolvido em"><input type="datetime-local" className="campo" value={quando} onChange={(e) => setQuando(e.target.value)} required /></Campo>
      {emprestimo.acessorios.length > 0 && (
        <fieldset>
          <legend className="rotulo">Acessórios que voltaram</legend>
          <div className="flex flex-wrap gap-4">
            {emprestimo.acessorios.map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input type="checkbox" checked={voltaram.includes(a)} onChange={(e) => setVoltaram((l) => (e.target.checked ? [...l, a] : l.filter((x) => x !== a)))} /> {a}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Campo rotulo="Observação da devolução"><textarea className="campo" rows={2} value={obsDevolucao} onChange={(e) => setObs(e.target.value)} /></Campo>
      {config.assinaturas && <CampoAssinatura rotulo="Assinatura da devolução" onChange={setAssinatura} />}
      {erro && <p role="alert" className="text-[var(--late)]">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn" disabled={salvando}>Confirmar devolução</button>
      </div>
    </form>
  );
}
