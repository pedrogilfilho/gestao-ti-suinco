'use client';
import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TIPOS_EQUIP, TIPOS_COM_IP, TIPOS_IMPRESSORA, TIPOS_LOCAL_FIXO, type TipoEquip } from '@gestao/shared';
import { api, ErroApi } from '@/lib/api';
import { useAviso } from '@/lib/aviso';
import type { Equipamento, Setor } from '@/lib/tipos';
import { Campo } from '@/components/Campo';
import { SeletorPessoa, type PessoaResumo } from '@/components/SeletorPessoa';

const SITUACOES: [Equipamento['situacao'], string][] = [
  ['ativo', 'Ativo (em uso normal)'], ['manutencao', 'Em manutenção'], ['danificado', 'Danificado'], ['extraviado', 'Extraviado'], ['baixado', 'Baixado'],
];

type Estado = {
  codigo: string; tipo: string; modelo: string; patrimonio: string; serie: string; situacao: Equipamento['situacao']; somenteCadastro: boolean;
  pessoa: PessoaResumo | null; vinculoLivre: string; modoLivre: boolean; setorId: string; ipTipo: '' | 'dhcp' | 'fixo'; ip: string; mac: string;
  temCorp: boolean; numeroCorp: string; temPart: boolean; numeroPart: string; tipoChip: string; termoStatus: Equipamento['termoStatus'];
  termoObs: string; garantiaAte: string; predio: string; pontoRede: string; firmware: string; trocasCabeca: string;
  licencas: { nome: string; chave: string }[]; dataAtivacao: string; obs: string;
};

const inicial = (e?: Equipamento): Estado => ({
  codigo: e?.codigo ?? '', tipo: e?.tipo ?? '', modelo: e?.modelo ?? '', patrimonio: e?.patrimonio ?? '', serie: e?.serie ?? '',
  situacao: e?.situacao ?? 'ativo', somenteCadastro: e?.somenteCadastro ?? false,
  pessoa: e?.pessoa ? { id: e.pessoa.id, nome: e.pessoa.nome, email: e.pessoa.email } : null,
  vinculoLivre: e?.vinculoLivre ?? '', modoLivre: !!e?.vinculoLivre, setorId: e?.setorId ?? '',
  ipTipo: e?.ipTipo ?? '', ip: e?.ip ?? '', mac: e?.mac ?? '',
  temCorp: !!e?.numeroCorp, numeroCorp: e?.numeroCorp ?? '', temPart: !!e?.numeroPart, numeroPart: e?.numeroPart ?? '',
  tipoChip: e?.tipoChip ?? '', termoStatus: e?.termoStatus ?? 'nao_informado', termoObs: e?.termoObs ?? '',
  garantiaAte: e?.garantiaAte?.slice(0, 10) ?? '', predio: e?.predio ?? '', pontoRede: e?.pontoRede ?? '', firmware: e?.firmware ?? '',
  trocasCabeca: e?.trocasCabeca != null ? String(e.trocasCabeca) : '', licencas: e?.licencas ?? [],
  dataAtivacao: e?.dataAtivacao?.slice(0, 10) ?? '', obs: e?.obs ?? '',
});

export function FormEquipamento({ equipamento, onFechar }: { equipamento?: Equipamento; onFechar: () => void }) {
  const [f, setF] = useState<Estado>(() => inicial(equipamento));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: setores } = useQuery({ queryKey: ['setores'], queryFn: () => api<{ itens: Setor[] }>('/setores') });
  const mudar = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }));
  const t = f.tipo as TipoEquip;
  const temIp = TIPOS_COM_IP.includes(t), local = TIPOS_LOCAL_FIXO.includes(t);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErros({}); setSalvando(true);
    const corpo = {
      codigo: f.codigo, tipo: f.tipo, modelo: f.modelo, patrimonio: f.patrimonio, serie: f.serie, situacao: f.situacao,
      somenteCadastro: f.somenteCadastro, setorId: f.setorId || null, obs: f.obs,
      pessoaId: !local && !f.modoLivre ? f.pessoa?.id ?? null : null, vinculoLivre: !local && f.modoLivre ? f.vinculoLivre : '',
      ipTipo: temIp ? f.ipTipo || null : null, ip: temIp && f.ipTipo === 'fixo' ? f.ip : undefined, mac: temIp ? f.mac : '',
      numeroCorp: f.temCorp ? f.numeroCorp : '', numeroPart: f.temPart ? f.numeroPart : '',
      tipoChip: t === 'Chip' ? f.tipoChip : '', termoStatus: f.termoStatus, termoObs: f.termoObs,
      garantiaAte: f.garantiaAte || null, dataAtivacao: t === 'Celular' && f.dataAtivacao ? f.dataAtivacao : null,
      predio: local ? f.predio : '', pontoRede: local ? f.pontoRede : '',
      firmware: TIPOS_IMPRESSORA.includes(t) ? f.firmware : '', trocasCabeca: TIPOS_IMPRESSORA.includes(t) && f.trocasCabeca ? Number(f.trocasCabeca) : null,
      licencas: f.licencas.filter((l) => l.nome || l.chave),
    };
    if (f.temCorp && !f.numeroCorp) { setSalvando(false); return setErros({ numeroCorp: 'Informe o número corporativo ou desmarque Telefone corporativo.' }); }
    if (f.temPart && !f.numeroPart) { setSalvando(false); return setErros({ numeroPart: 'Informe o número particular ou desmarque Telefone particular.' }); }
    try {
      if (equipamento) await api(`/equipamentos/${equipamento.id}`, { metodo: 'PATCH', corpo });
      else await api('/equipamentos', { metodo: 'POST', corpo });
      await qc.invalidateQueries({ queryKey: ['equipamentos'] });
      avisar(equipamento ? 'Equipamento atualizado.' : 'Equipamento cadastrado.');
      onFechar();
    } catch (e) {
      const ea = e instanceof ErroApi ? e : null;
      setErros({ [ea?.campo ?? '_']: ea?.mensagem ?? 'Não foi possível salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="Nome" erro={erros.codigo}><input className="campo" value={f.codigo} onChange={(e) => mudar('codigo', e.target.value)} required /></Campo>
      <Campo rotulo="Tipo" erro={erros.tipo}>
        <select className="campo" value={f.tipo} onChange={(e) => mudar('tipo', e.target.value)} required>
          <option value="">Escolha...</option>
          {TIPOS_EQUIP.map((x) => <option key={x}>{x}</option>)}
        </select>
      </Campo>
      <Campo rotulo={t === 'Chip' ? 'Operadora / plano' : 'Modelo'}><input className="campo" value={f.modelo} onChange={(e) => mudar('modelo', e.target.value)} /></Campo>
      <Campo rotulo="Patrimônio"><input className="campo" value={f.patrimonio} onChange={(e) => mudar('patrimonio', e.target.value)} /></Campo>
      <Campo rotulo="Série"><input className="campo" value={f.serie} onChange={(e) => mudar('serie', e.target.value)} /></Campo>
      <Campo rotulo="Situação">
        <select className="campo" value={f.situacao} onChange={(e) => mudar('situacao', e.target.value as Estado['situacao'])}>
          {SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </Campo>

      {!local && (
        <div className="sm:col-span-2">
          {f.modoLivre ? (
            <Campo rotulo="Vincular a um texto (ex.: Sala de Reunião)" erro={erros.vinculoLivre}>
              <input className="campo" value={f.vinculoLivre} onChange={(e) => mudar('vinculoLivre', e.target.value)} />
            </Campo>
          ) : (
            <SeletorPessoa rotulo="Vincular a um colaborador" valor={f.pessoa} onChange={(p) => mudar('pessoa', p)} erro={erros.pessoaId} />
          )}
          <button type="button" className="link mt-1 text-sm" onClick={() => mudar('modoLivre', !f.modoLivre)}>
            {f.modoLivre ? 'Vincular a um colaborador' : 'Não é uma pessoa? Vincular a um texto'}
          </button>
        </div>
      )}
      <Campo rotulo="Setor (centro de custo)" erro={erros.setorId}>
        <select className="campo" value={f.setorId} onChange={(e) => mudar('setorId', e.target.value)}>
          <option value="">Nenhum</option>
          {setores?.itens.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Campo>
      <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={f.somenteCadastro} onChange={(e) => mudar('somenteCadastro', e.target.checked)} /> Somente cadastro (não entra em empréstimo)</label>

      {temIp && (
        <>
          <Campo rotulo="Endereço IP">
            <select className="campo" value={f.ipTipo} onChange={(e) => mudar('ipTipo', e.target.value as Estado['ipTipo'])}>
              <option value="">Não informado</option><option value="dhcp">Automático (DHCP)</option><option value="fixo">Fixo</option>
            </select>
          </Campo>
          {f.ipTipo === 'fixo' && <Campo rotulo="IP" erro={erros.ip}><input className="campo" value={f.ip} onChange={(e) => mudar('ip', e.target.value)} placeholder="10.0.0.10" /></Campo>}
          <Campo rotulo="MAC" erro={erros.mac}><input className="campo" value={f.mac} onChange={(e) => mudar('mac', e.target.value.toUpperCase())} placeholder="AA:BB:CC:DD:EE:FF" /></Campo>
        </>
      )}
      {['Celular', 'Chip'].includes(t) && (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.temCorp} onChange={(e) => setF((x) => ({ ...x, temCorp: e.target.checked, numeroCorp: e.target.checked ? x.numeroCorp : '' }))} /> Telefone corporativo</label>
            {f.temCorp && <Campo rotulo="Número corporativo" erro={erros.numeroCorp}><input className="campo" value={f.numeroCorp} onChange={(e) => mudar('numeroCorp', e.target.value)} placeholder="(34) 99999-9999" /></Campo>}
          </div>
          <div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.temPart} onChange={(e) => setF((x) => ({ ...x, temPart: e.target.checked, numeroPart: e.target.checked ? x.numeroPart : '' }))} /> Telefone particular</label>
            {f.temPart && <Campo rotulo="Número particular" erro={erros.numeroPart}><input className="campo" value={f.numeroPart} onChange={(e) => mudar('numeroPart', e.target.value)} placeholder="(34) 99999-9999" /></Campo>}
          </div>
        </div>
      )}
      {t === 'Chip' && <Campo rotulo="Tipo do chip"><select className="campo" value={f.tipoChip} onChange={(e) => mudar('tipoChip', e.target.value)}><option value="">Não informado</option><option>SIM físico</option><option>eSIM</option></select></Campo>}
      {t === 'Celular' && <Campo rotulo="Data de ativação"><input type="date" className="campo" value={f.dataAtivacao} onChange={(e) => mudar('dataAtivacao', e.target.value)} /></Campo>}
      {TIPOS_IMPRESSORA.includes(t) && (
        <>
          <Campo rotulo="Firmware"><input className="campo" value={f.firmware} onChange={(e) => mudar('firmware', e.target.value)} /></Campo>
          <Campo rotulo="Trocas de cabeça"><input type="number" min={0} className="campo" value={f.trocasCabeca} onChange={(e) => mudar('trocasCabeca', e.target.value)} /></Campo>
        </>
      )}
      {local && (
        <>
          <Campo rotulo="Prédio / local"><input className="campo" value={f.predio} onChange={(e) => mudar('predio', e.target.value)} /></Campo>
          <Campo rotulo="Ponto de rede"><input className="campo" value={f.pontoRede} onChange={(e) => mudar('pontoRede', e.target.value)} /></Campo>
        </>
      )}
      <Campo rotulo="Garantia até"><input type="date" className="campo" value={f.garantiaAte} onChange={(e) => mudar('garantiaAte', e.target.value)} /></Campo>
      <Campo rotulo="Termo de responsabilidade">
        <select className="campo" value={f.termoStatus} onChange={(e) => mudar('termoStatus', e.target.value as Estado['termoStatus'])}>
          <option value="nao_informado">Não informado</option><option value="assinado">Assinado</option><option value="nao_assinado">Não assinado</option>
        </select>
      </Campo>
      <Campo rotulo="Observação do termo" className="sm:col-span-2"><input className="campo" value={f.termoObs} onChange={(e) => mudar('termoObs', e.target.value)} /></Campo>

      <fieldset className="sm:col-span-2">
        <legend className="rotulo">Licenças</legend>
        {f.licencas.map((l, i) => (
          <div key={i} className="mt-1 flex gap-2">
            <input className="campo" aria-label={`Licença ${i + 1}: nome`} placeholder="Nome (ex.: Office)" value={l.nome} onChange={(e) => mudar('licencas', f.licencas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <input className="campo" aria-label={`Licença ${i + 1}: chave`} placeholder="Chave" value={l.chave} onChange={(e) => mudar('licencas', f.licencas.map((x, j) => (j === i ? { ...x, chave: e.target.value } : x)))} />
            <button type="button" className="link" onClick={() => mudar('licencas', f.licencas.filter((_, j) => j !== i))}>Remover</button>
          </div>
        ))}
        <button type="button" className="link mt-1 text-sm" onClick={() => mudar('licencas', [...f.licencas, { nome: '', chave: '' }])}>Adicionar licença</button>
      </fieldset>
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="campo" rows={2} value={f.obs} onChange={(e) => mudar('obs', e.target.value)} /></Campo>

      {erros._ && <p role="alert" className="text-[var(--late)] sm:col-span-2">{erros._}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button className="btn" disabled={salvando}>Salvar</button>
      </div>
    </form>
  );
}
