'use client';
import { useState } from 'react';
import { ErroApi } from '@/lib/api';

export type Resultado = { criados: number; erros: { linha: number; mensagem: string }[]; senhas?: { email: string; senha: string }[] };

// Colar linhas (separadas por tab, como vem da planilha, ou por ";"), conferir e cadastrar.
export function CadastroEmMassa({ colunas, exemplo, montar, onEnviar }: {
  colunas: string[];
  exemplo: string;
  montar: (cels: string[]) => Record<string, unknown>;
  onEnviar: (linhas: Record<string, unknown>[]) => Promise<Resultado>;
}) {
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim()));

  async function enviar() {
    setErro(''); setRes(null); setEnviando(true);
    try {
      setRes(await onEnviar(linhas.map(montar)));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível cadastrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="meta">Colunas: {colunas.join(' · ')}. Uma linha por cadastro; pode colar direto da planilha.</p>
      <label className="rotulo">Cole as linhas
        <textarea className="campo font-mono text-sm" rows={8} value={texto} placeholder={exemplo} onChange={(e) => { setTexto(e.target.value); setRes(null); }} />
      </label>
      {linhas.length > 0 && !res && (
        <div className="max-h-48 overflow-auto">
          <table className="tabela text-sm">
            <thead><tr><th>#</th>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{linhas.map((l, i) => <tr key={i}><td>{i + 1}</td>{colunas.map((_, j) => <td key={j}>{l[j] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {erro && <p role="alert" className="text-[var(--late)]">{erro}</p>}
      {res && (
        <div className="card">
          <p className="font-semibold">{res.criados} cadastrado{res.criados === 1 ? '' : 's'}{res.erros.length ? `, ${res.erros.length} com problema` : ''}.</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{res.erros.map((e) => <li key={e.linha}>Linha {e.linha}: {e.mensagem}</li>)}</ul>
          {!!res.senhas?.length && (
            <div className="mt-3 text-sm">
              <p className="font-semibold">Senhas temporárias (anote agora; não aparecem de novo):</p>
              <ul className="font-mono">{res.senhas.map((s) => <li key={s.email}>{s.email}: {s.senha}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn" disabled={!linhas.length || enviando} onClick={enviar}>Cadastrar</button>
      </div>
    </div>
  );
}
