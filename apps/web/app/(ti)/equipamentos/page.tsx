'use client';
import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIPOS_EQUIP } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import { usePerguntar } from '@/lib/pergunta';
import { usePode } from '@/lib/usePode';
import { useFiltrosUrl } from '@/lib/useFiltrosUrl';
import { dataHoraBR, type Equipamento } from '@/lib/tipos';
import { PaginaLista, type Coluna } from '@/components/PaginaLista';
import { ChipsFiltro, type Opcao } from '@/components/ChipsFiltro';
import { Busca } from '@/components/Busca';
import { Selo } from '@/components/Selo';
import { Dialogo } from '@/components/Dialogo';
import { CadastroEmMassa, type Resultado } from '@/components/CadastroEmMassa';
import { FormEquipamento } from './FormEquipamento';

const SITUACAO: Opcao[] = [
  { valor: 'livre', rotulo: 'Disponível', cls: 'ok' }, { valor: 'fora', rotulo: 'Emprestado', cls: 'out' },
  { valor: 'atrib', rotulo: 'Vinculado', cls: 'out' }, { valor: 'estoque', rotulo: 'Em estoque', cls: 'ok' },
  { valor: 'manut', rotulo: 'Em manutenção', cls: 'warn' }, { valor: 'danificado', rotulo: 'Danificado', cls: 'late' },
  { valor: 'extraviado', rotulo: 'Extraviado', cls: 'late' }, { valor: 'baixado', rotulo: 'Baixado', cls: 'late' },
];
// "Reservado para Ana em 20/10 08:00" (a situação continua Disponível)
const reservado = (e: Equipamento) => e.proximaReserva && (
  <span className="meta block text-xs">Reservado para {e.proximaReserva.pessoaNome} em {dataHoraBR(e.proximaReserva.inicioEm)}</span>
);
const vinculo = (e: Equipamento) => e.pessoa?.nome ?? (e.vinculoLivre || e.emprestimoAberto?.pessoaNome || '');

function Equipamentos() {
  const [f, mudar] = useFiltrosUrl({ q: '', situacao: '', tipo: '' });
  const [editando, setEditando] = useState<Equipamento | 'novo' | null>(null);
  const [lote, setLote] = useState(false);
  const podeEditar = usePode('equipamentos'), podeExcluir = usePode('excluir');
  const qc = useQueryClient();
  const avisar = useAviso();
  const perguntar = usePerguntar();

  async function excluir(e: Equipamento) {
    if (!(await perguntar(`Excluir ${e.codigo}? Dá para restaurar depois pela Auditoria.`, 'Excluir', { titulo: 'Excluir', perigo: true }))) return;
    try {
      await api(`/equipamentos/${e.id}`, { metodo: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['equipamentos'] });
      avisar('Equipamento excluído.');
    } catch (err) {
      avisar(err instanceof ErroApi ? err.mensagem : 'Não foi possível excluir.');
    }
  }

  const acoes = (e: Equipamento) => (
    <div className="flex gap-3">
      {podeEditar && <button type="button" className="link" onClick={() => setEditando(e)}>Editar</button>}
      {podeExcluir && <button type="button" className="link text-[var(--late)]" onClick={() => excluir(e)}>Excluir</button>}
    </div>
  );
  const colunas: Coluna<Equipamento>[] = [
    { titulo: 'Nome', celula: (e) => <b>{e.codigo}</b> },
    { titulo: 'Tipo', celula: (e) => e.tipo },
    { titulo: 'Modelo', celula: (e) => e.modelo },
    { titulo: 'Patrimônio', celula: (e) => e.patrimonio },
    { titulo: 'Vinculado a', celula: vinculo },
    { titulo: 'Situação', celula: (e) => <><Selo s={e.situacaoExibida} />{reservado(e)}</> },
    { titulo: '', celula: acoes },
  ];

  return (
    <>
      <PaginaLista<Equipamento>
        titulo="Equipamentos" area="equipamentos" caminho="/equipamentos" filtros={f} auditoriaArea="equipamentos"
        colunas={colunas} nomeLinha={(e) => e.codigo}
        acoesTopo={podeEditar && (
          <>
            <button type="button" className="btn" onClick={() => setEditando('novo')}>Novo equipamento</button>
            <button type="button" className="btn ghost" onClick={() => setLote(true)}>Cadastro em massa</button>
          </>
        )}
        topo={(
          <>
            <Busca valor={f.q} onChange={(q) => mudar({ q })} />
            <ChipsFiltro nome="Situação" opcoes={SITUACAO} valor={f.situacao} onChange={(situacao) => mudar({ situacao })} />
            <ChipsFiltro nome="Tipo" opcoes={TIPOS_EQUIP.map((t) => ({ valor: t, rotulo: t }))} valor={f.tipo} onChange={(tipo) => mudar({ tipo })} />
          </>
        )}
        cartao={(e) => (
          <>
            <div className="flex items-start justify-between gap-2"><b>{e.codigo}</b><Selo s={e.situacaoExibida} /></div>
            <p className="meta">{[e.tipo, e.modelo ? `Modelo: ${e.modelo}` : '', e.patrimonio && `patr. ${e.patrimonio}`].filter(Boolean).join(' · ')}</p>
            {vinculo(e) && <p className="text-sm">Com: {vinculo(e)}</p>}
            {reservado(e)}
            <div className="mt-2">{acoes(e)}</div>
          </>
        )}
      />
      <Dialogo titulo={editando === 'novo' ? 'Novo equipamento' : 'Editar equipamento'} aberto={!!editando} onFechar={() => setEditando(null)}>
        {editando && <FormEquipamento equipamento={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Dialogo>
      <Dialogo titulo="Cadastro em massa" aberto={lote} onFechar={() => setLote(false)}>
        <CadastroEmMassa
          colunas={['Nome', 'Tipo', 'Modelo', 'Patrimônio', 'Série', 'IP (vazio, DHCP ou o endereço)']}
          exemplo={'NB-EMP-10\tNotebook Empréstimo\tDell Latitude\t12345\tABC123\tDHCP'}
          montar={([codigo, tipo, modelo, patrimonio, serie, ip]) => {
            const ipTxt = (ip ?? '').trim();
            return {
              codigo, tipo, modelo: modelo ?? '', patrimonio: patrimonio ?? '', serie: serie ?? '',
              ...(ipTxt ? (ipTxt.toLowerCase() === 'dhcp' ? { ipTipo: 'dhcp' } : { ipTipo: 'fixo', ip: ipTxt }) : {}),
            };
          }}
          onEnviar={async (linhas) => {
            const r = await api<Resultado>('/equipamentos/lote', { metodo: 'POST', corpo: { linhas } });
            await qc.invalidateQueries({ queryKey: ['equipamentos'] });
            return r;
          }}
        />
      </Dialogo>
    </>
  );
}

export default function Pagina() {
  return <Suspense><Equipamentos /></Suspense>;
}
