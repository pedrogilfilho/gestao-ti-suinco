'use client';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { useAtalho } from '@/lib/atalhos';
import { dataHoraBR, type Config, type Emprestimo } from '@/lib/tipos';
import { PaginaLista, type Coluna } from '@/components/PaginaLista';
import { ChipsFiltro, type Opcao } from '@/components/ChipsFiltro';
import { Busca } from '@/components/Busca';
import { Selo } from '@/components/Selo';
import { Dialogo } from '@/components/Dialogo';
import { FormEmprestimo } from './FormEmprestimo';
import { FormDevolucao } from './FormDevolucao';
import { Resolver } from './Resolver';

const MOSTRAR: Opcao[] = [
  { valor: 'abertos', rotulo: 'Abertos', cls: 'out' }, { valor: 'atrasados', rotulo: 'Atrasados', cls: 'late' },
  { valor: 'pendencias', rotulo: 'Pendências', cls: 'warn' }, { valor: 'devolvidos', rotulo: 'Devolvidos', cls: 'ok' },
  { valor: 'todos', rotulo: 'Todos' },
];
const finalidade = (e: Emprestimo) => (e.finalidade === 'Outra' && e.finalidadeOutra ? `Outra: ${e.finalidadeOutra}` : e.finalidade);
const temPendencia = (e: Emprestimo) => !!e.devolvidoEm && e.situacao.txt !== 'Devolvido';

// Link do WhatsApp para cobrar a devolução de quem está atrasado.
function linkCobrar(e: Emprestimo) {
  const tel = (e.pessoa.telefoneCorp || e.pessoa.telefonePart || '').replace(/\D/g, '');
  if (!tel) return null;
  const texto = `Olá, ${e.pessoa.nome.split(' ')[0]}! O equipamento ${e.equipamento.codigo} estava previsto para devolução em ${dataHoraBR(e.previsaoEm)}. Pode devolver na TI, por favor?`;
  return `https://wa.me/55${tel}?text=${encodeURIComponent(texto)}`;
}

type Aberto = { tipo: 'novo' } | { tipo: 'editar' | 'devolver' | 'resolver'; e: Emprestimo } | null;

function EmUso() {
  const [f, mudar] = useFiltrosUrl({ q: '', status: 'abertos' });
  const [aberto, setAberto] = useState<Aberto>(null);
  const podeEmprestar = usePode('emprestar'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') });
  useAtalho('n', () => podeEmprestar && setAberto({ tipo: 'novo' }));
  const fechar = () => setAberto(null);

  async function excluir(e: Emprestimo) {
    if (!(await perguntar(`Excluir o empréstimo de ${e.equipamento.codigo} para ${e.pessoa.nome}? Dá para restaurar depois pela Auditoria.`, 'Excluir', { titulo: 'Excluir', perigo: true }))) return;
    try {
      await api(`/emprestimos/${e.id}`, { metodo: 'DELETE' });
      await Promise.all(['emprestimos', 'equipamentos', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar('Empréstimo excluído.');
    } catch (err) {
      avisar(err instanceof ErroApi ? err.mensagem : 'Não foi possível excluir.');
    }
  }

  const acoes = (e: Emprestimo) => {
    const cobrar = e.situacao.k === 'late' ? linkCobrar(e) : null;
    return (
      <div className="flex flex-wrap gap-3">
        {podeEmprestar && !e.devolvidoEm && <button type="button" className="link" onClick={() => setAberto({ tipo: 'devolver', e })}>Devolver</button>}
        {podeEmprestar && temPendencia(e) && <button type="button" className="link" onClick={() => setAberto({ tipo: 'resolver', e })}>Resolver</button>}
        {cobrar && <a className="link" href={cobrar} target="_blank" rel="noreferrer">Cobrar</a>}
        {podeEmprestar && <button type="button" className="link" onClick={() => setAberto({ tipo: 'editar', e })}>Editar</button>}
        {podeExcluir && <button type="button" className="link text-[var(--late)]" onClick={() => excluir(e)}>Excluir</button>}
      </div>
    );
  };
  const chamado = (e: Emprestimo) =>
    e.chamadoGlpi && config?.glpiUrl ? <a className="link" href={config.glpiUrl + e.chamadoGlpi} target="_blank" rel="noreferrer">{e.chamadoGlpi}</a> : e.chamadoGlpi;
  const colunas: Coluna<Emprestimo>[] = [
    { titulo: 'Equipamento', celula: (e) => <b>{e.equipamento.codigo}</b> },
    { titulo: 'Colaborador', celula: (e) => <>{e.pessoa.nome}<span className="meta block">{e.pessoa.setor}</span></> },
    { titulo: 'Técnico', celula: (e) => e.tecnico?.nome ?? '' },
    { titulo: 'Finalidade', celula: finalidade },
    { titulo: 'Retirada', celula: (e) => dataHoraBR(e.retiradaEm) },
    { titulo: 'Previsão', celula: (e) => dataHoraBR(e.previsaoEm) },
    { titulo: 'Situação', celula: (e) => <Selo s={e.situacao} /> },
    { titulo: 'Chamado GLPI', celula: chamado },
    { titulo: '', celula: acoes },
  ];

  const titulo = !aberto ? '' : aberto.tipo === 'novo' ? 'Registrar empréstimo'
    : `${{ editar: 'Editar empréstimo de', devolver: 'Devolver', resolver: 'Resolver' }[aberto.tipo]} ${aberto.e.equipamento.codigo}`;
  return (
    <>
      <PaginaLista<Emprestimo>
        titulo="Em uso" area="emprestimos" caminho="/emprestimos" filtros={f} auditoriaArea="emprestimos"
        colunas={colunas} nomeLinha={(e) => `${e.equipamento.codigo} — ${e.pessoa.nome}`}
        vazio={f.status === 'abertos' ? 'Nenhum equipamento emprestado agora.' : undefined}
        acoesTopo={podeEmprestar && (
          <button type="button" className="btn" title="Atalho: Alt+N" onClick={() => setAberto({ tipo: 'novo' })}>Registrar empréstimo</button>
        )}
        topo={(
          <>
            <Busca valor={f.q} onChange={(q) => mudar({ q })} />
            <ChipsFiltro nome="Mostrar" opcoes={MOSTRAR} valor={f.status} onChange={(status) => mudar({ status })} />
          </>
        )}
        cartao={(e) => (
          <>
            <div className="flex items-start justify-between gap-2"><b>{e.equipamento.codigo}</b><Selo s={e.situacao} /></div>
            <p>{e.pessoa.nome} <span className="meta">({e.pessoa.setor})</span></p>
            <p className="meta">{finalidade(e)} · Previsão: {dataHoraBR(e.previsaoEm)}</p>
            <div className="mt-2">{acoes(e)}</div>
          </>
        )}
      />
      <Dialogo titulo={titulo} aberto={!!aberto && !!config} onFechar={fechar}>
        {aberto && config && (
          aberto.tipo === 'novo' ? <FormEmprestimo config={config} onFechar={fechar} />
            : aberto.tipo === 'editar' ? <FormEmprestimo emprestimo={aberto.e} config={config} onFechar={fechar} />
              : aberto.tipo === 'devolver' ? <FormDevolucao emprestimo={aberto.e} config={config} onFechar={fechar} />
                : <Resolver emprestimo={aberto.e} config={config} onFechar={fechar} />
        )}
      </Dialogo>
    </>
  );
}

export default function Pagina() {
  return <Suspense><EmUso /></Suspense>;
}
