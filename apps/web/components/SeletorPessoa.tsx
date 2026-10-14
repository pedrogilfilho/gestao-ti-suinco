'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PessoaResumo = { id: string; nome: string; email: string; setor?: { nome: string } };

// Busca de pessoa (nome, e-mail ou setor; vários termos). Sem o limite de 40 do app antigo: pagina na API.
export function SeletorPessoa({ rotulo, valor, onChange, erro }: {
  rotulo: string; valor: PessoaResumo | null; onChange: (p: PessoaResumo | null) => void; erro?: string;
}) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(texto), 250); return () => clearTimeout(t); }, [texto]);
  const { data } = useQuery({
    queryKey: ['pessoas', 'seletor', q], enabled: aberto,
    queryFn: () => api<{ itens: PessoaResumo[] }>(`/pessoas?ativo=sim&limite=20&q=${encodeURIComponent(q)}`),
  });

  if (valor) {
    return (
      <div className="rotulo">
        {rotulo}
        <div className="campo flex items-center justify-between">
          <span>{valor.nome} / <span className="meta">{valor.email}</span></span>
          <button type="button" className="link" onClick={() => onChange(null)}>Trocar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <label className="rotulo" htmlFor={id}>{rotulo}</label>
      <input
        id={id} className="campo" role="combobox" aria-expanded={aberto} aria-controls={`${id}-lista`} autoComplete="off"
        placeholder="Digite nome, e-mail ou setor" value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
      />
      {erro && <span className="mt-1 block text-sm text-[var(--late)]">{erro}</span>}
      {aberto && (
        <ul id={`${id}-lista`} role="listbox" className="card absolute z-50 mt-1 max-h-64 w-full overflow-y-auto p-0">
          {(data?.itens ?? []).map((p) => (
            <li key={p.id} role="option" aria-selected={false} className="cursor-pointer px-3 py-2 hover:bg-[var(--tag)]"
              onMouseDown={(e) => { e.preventDefault(); onChange(p); setTexto(''); setAberto(false); }}>
              {p.nome} / <span className="meta">{p.email}{p.setor ? ` · ${p.setor.nome}` : ''}</span>
            </li>
          ))}
          {data && !data.itens.length && <li className="meta px-3 py-2">Ninguém encontrado.</li>}
        </ul>
      )}
    </div>
  );
}
