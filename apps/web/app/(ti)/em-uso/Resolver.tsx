'use client';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import type { Config, Emprestimo } from '@/lib/tipos';
import { CampoAssinatura } from '@/components/CampoAssinatura';

// Pendência de devolução: acessórios que chegaram depois e assinaturas que faltaram.
export function Resolver({ emprestimo, config, onFechar }: { emprestimo: Emprestimo; config: Config; onFechar: () => void }) {
  const [recebidos, setRecebidos] = useState<string[]>([]);
  const [assDev, setAssDev] = useState<string | undefined>();
  const [assRet, setAssRet] = useState<string | undefined>();
  const [erro, setErro] = useState('');
  const qc = useQueryClient();
  const avisar = useAviso();

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    try {
      await api(`/emprestimos/${emprestimo.id}/resolver`, {
        metodo: 'POST', corpo: { acessoriosRecebidos: recebidos, ...(assDev && { assinaturaDevolucao: assDev }), ...(assRet && { assinaturaRetirada: assRet }) },
      });
      await Promise.all(['emprestimos', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Pendência atualizada.');
      onFechar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível salvar.');
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      {emprestimo.acessoriosFaltando.length > 0 && (
        <fieldset>
          <legend className="rotulo">Acessórios recebidos agora</legend>
          <div className="flex flex-wrap gap-4">
            {emprestimo.acessoriosFaltando.map((a) => (
              <label key={a} className="flex items-center gap-2">
                <input type="checkbox" checked={recebidos.includes(a)} onChange={(e) => setRecebidos((l) => (e.target.checked ? [...l, a] : l.filter((x) => x !== a)))} /> {a}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {config.assinaturas && !emprestimo.temAssinaturaDevolucao && <CampoAssinatura rotulo="Assinatura da devolução" onChange={setAssDev} />}
      {config.assinaturas && !emprestimo.temAssinaturaRetirada && <CampoAssinatura rotulo="Assinatura da retirada" onChange={setAssRet} />}
      {erro && <p role="alert" className="text-[var(--late)]">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}
