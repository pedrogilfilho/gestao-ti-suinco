'use client';
import { Suspense, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { dataBR, type Config, type Reserva } from '@/lib/tipos';
import { PaginaLista, type Coluna } from '@/components/PaginaLista';
import { ChipsFiltro, type Opcao } from '@/components/ChipsFiltro';
import { Busca } from '@/components/Busca';
import { Selo } from '@/components/Selo';
import { Dialogo } from '@/components/Dialogo';
import { FormEmprestimo } from '../em-uso/FormEmprestimo';
import { FormReserva } from './FormReserva';
import { horaSP, diaSP } from '@gestao/shared';

const MOSTRAR: Opcao[] = [
  { valor: 'proximas', rotulo: 'Próximas', cls: 'out' }, { valor: 'hoje', rotulo: 'Hoje', cls: 'warn' },
  { valor: 'historico', rotulo: 'Histórico' }, { valor: 'todas', rotulo: 'Todas' },
];
// "20/10/2026 08:00–12:00" ou, de vários dias, "20/10/2026 08:00 até 22/10/2026 17:00"
const quando = (r: Reserva) => {
  const a = new Date(r.inicioEm), b = new Date(r.fimEm);
  return diaSP(a) === diaSP(b) ? `${dataBR(r.inicioEm)} ${horaSP(a)}–${horaSP(b)}` : `${dataBR(r.inicioEm)} ${horaSP(a)} até ${dataBR(r.fimEm)} ${horaSP(b)}`;
};
const finalidade = (r: Reserva) => (r.finalidade === 'Outra' && r.finalidadeOutra ? `Outra: ${r.finalidadeOutra}` : r.finalidade);

type Aberto = { tipo: 'nova' } | { tipo: 'editar' | 'retirar'; r: Reserva } | null;

function Reservas() {
  const [f, mudar] = useFiltrosUrl({ q: '', status: 'proximas' });
  const [aberto, setAberto] = useState<Aberto>(null);
  const podeReservar = usePode('reservar'), podeEmprestar = usePode('emprestar'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config') });
  const fechar = () => setAberto(null);

  async function acao(r: Reserva, texto: string, ok: string, fazer: () => Promise<unknown>, aviso: string) {
    if (!(await perguntar(texto, ok, { perigo: true }))) return;
    try {
      await fazer();
      await Promise.all(['reservas', 'contadores'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      avisar(aviso);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.mensagem : 'Não foi possível concluir.');
    }
    void r;
  }
  const acoes = (r: Reserva) => (
    <div className="flex flex-wrap gap-3">
      {r.status === 'ativa' && podeEmprestar && <button type="button" className="link" onClick={() => setAberto({ tipo: 'retirar', r })}>Registrar retirada</button>}
      {r.status === 'ativa' && podeReservar && <button type="button" className="link" onClick={() => setAberto({ tipo: 'editar', r })}>Editar</button>}
      {r.status === 'ativa' && podeReservar && (
        <button type="button" className="link" onClick={() => acao(r, `Cancelar a reserva de ${r.equipamento.codigo} para ${r.pessoa.nome} em ${dataBR(r.inicioEm)}?`, 'Cancelar reserva',
          () => api(`/reservas/${r.id}/cancelar`, { metodo: 'POST' }), 'Reserva cancelada.')}>Cancelar</button>
      )}
      {podeExcluir && (
        <button type="button" className="link text-[var(--late)]" onClick={() => acao(r, `Excluir a reserva de ${r.equipamento.codigo} para ${r.pessoa.nome}? Dá para restaurar depois pela Auditoria.`, 'Excluir',
          () => api(`/reservas/${r.id}`, { metodo: 'DELETE' }), 'Reserva excluída.')}>Excluir</button>
      )}
    </div>
  );
  const colunas: Coluna<Reserva>[] = [
    { titulo: 'Equipamento', celula: (r) => <b>{r.equipamento.codigo}</b> },
    { titulo: 'Colaborador', celula: (r) => <>{r.pessoa.nome}<span className="meta block">{r.pessoa.setor}</span></> },
    { titulo: 'Quando', celula: quando },
    { titulo: 'Finalidade', celula: finalidade },
    { titulo: 'Chamado GLPI', celula: (r) => r.chamadoGlpi },
    { titulo: 'Situação', celula: (r) => <Selo s={r.situacao} /> },
    { titulo: '', celula: acoes },
  ];
  const titulo = !aberto ? '' : aberto.tipo === 'nova' ? 'Nova reserva' : aberto.tipo === 'editar' ? 'Editar reserva' : `Registrar retirada de ${aberto.r.equipamento.codigo}`;

  return (
    <>
      <PaginaLista<Reserva>
        titulo="Reservas" area="reservas" caminho="/reservas" filtros={f} auditoriaArea="reservas"
        colunas={colunas} nomeLinha={(r) => `${r.equipamento.codigo} — ${r.pessoa.nome}`}
        vazio={f.status === 'historico' ? 'Nenhuma reserva no histórico ainda. Aparecem aqui as reservas já retiradas, canceladas ou não retiradas.' : 'Nenhuma reserva para os próximos dias.'}
        acoesTopo={podeReservar && <button type="button" className="btn" onClick={() => setAberto({ tipo: 'nova' })}>Nova reserva</button>}
        topo={(
          <>
            <Busca valor={f.q} onChange={(q) => mudar({ q })} />
            <ChipsFiltro nome="Mostrar" opcoes={MOSTRAR} valor={f.status} onChange={(status) => mudar({ status })} />
          </>
        )}
        cartao={(r) => (
          <>
            <div className="flex items-start justify-between gap-2"><b>{r.equipamento.codigo}</b><Selo s={r.situacao} /></div>
            <p>{r.pessoa.nome} <span className="meta">({r.pessoa.setor})</span></p>
            <p className="meta">{quando(r)}{r.finalidade ? ` · ${finalidade(r)}` : ''}</p>
            {r.obs && <p className="meta text-sm">{r.obs}</p>}
            <div className="mt-2">{acoes(r)}</div>
          </>
        )}
      />
      <Dialogo titulo={titulo} aberto={!!aberto && !!config} onFechar={fechar}>
        {aberto && config && (
          aberto.tipo === 'nova' ? <FormReserva config={config} onFechar={fechar} />
            : aberto.tipo === 'editar' ? <FormReserva reserva={aberto.r} config={config} onFechar={fechar} />
              : (
                <FormEmprestimo config={config} onFechar={() => { fechar(); void qc.invalidateQueries({ queryKey: ['reservas'] }); }} preset={{
                  equipamento: aberto.r.equipamento, pessoa: { id: aberto.r.pessoa.id, nome: aberto.r.pessoa.nome, email: aberto.r.pessoa.email },
                  finalidade: aberto.r.finalidade || undefined, finalidadeOutra: aberto.r.finalidadeOutra, chamadoGlpi: aberto.r.chamadoGlpi,
                  obs: aberto.r.obs, previsaoEm: aberto.r.fimEm, reservaId: aberto.r.id,
                }} />
              )
        )}
      </Dialogo>
    </>
  );
}

export default function Pagina() {
  return <Suspense><Reservas /></Suspense>;
}
