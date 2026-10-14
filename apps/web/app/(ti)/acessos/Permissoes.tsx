'use client';
import { NOMES_PERMISSAO, PERMISSOES, type Permissao } from '@gestao/shared';

type Marcadas = Partial<Record<Permissao, boolean>>;
const ORDEM = [...PERMISSOES].sort((a, b) => NOMES_PERMISSAO[a].localeCompare(NOMES_PERMISSAO[b], 'pt-BR'));

// Checkboxes das permissões, em ordem alfabética do nome que aparece na tela.
export function Permissoes({ valor, onChange, travado, aviso }: { valor: Marcadas; onChange: (v: Marcadas) => void; travado?: boolean; aviso?: string }) {
  return (
    <fieldset>
      <legend className="rotulo">Permissões</legend>
      {aviso && <p className="meta mb-1 text-sm">{aviso}</p>}
      <div className="grid gap-1 sm:grid-cols-2">
        {ORDEM.map((p) => (
          <label key={p} className={`flex items-center gap-2 ${travado ? 'opacity-60' : ''}`}>
            <input type="checkbox" disabled={travado} checked={!!valor[p]} onChange={(e) => onChange({ ...valor, [p]: e.target.checked })} /> {NOMES_PERMISSAO[p]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
