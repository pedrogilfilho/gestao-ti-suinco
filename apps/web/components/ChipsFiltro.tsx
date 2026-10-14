export type Opcao = { valor: string; rotulo: string; cls?: 'ok' | 'out' | 'warn' | 'late' };

// Botões redondos coloridos por significado. Clicar de novo no ativo desliga o filtro.
// Sem números nos botões ("Todos", não "Todos 8"), como o Gerson pediu no redesign.
export function ChipsFiltro({ nome, opcoes, valor, onChange }: { nome: string; opcoes: Opcao[]; valor: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={nome} className="flex flex-wrap items-center gap-2">
      <span className="meta mr-1">{nome}:</span>
      {opcoes.map((o) => (
        <button
          key={o.valor} type="button" aria-pressed={valor === o.valor}
          onClick={() => onChange(valor === o.valor ? '' : o.valor)}
          className={`chip ${o.cls ?? ''} ${valor === o.valor ? 'ativo' : ''}`}
        >{o.rotulo}</button>
      ))}
    </div>
  );
}
