'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Campo } from './Campo';

export type Ocupacao = { id: string; codigo: string; tipo: string; modelo: string; motivo: string | null };

// Equipamentos de empréstimo no período: os ocupados aparecem desabilitados com o motivo (reserva, empréstimo, manutenção).
// Os do tipo preferido vêm primeiro; se o escolhido ficar ocupado, sugere o primeiro livre.
export function SeletorEquipamento({ inicio, fim, valor, onChange, ignorarReserva, tipoPreferido, erro }: {
  inicio: Date | null; fim: Date | null; valor: string; onChange: (id: string) => void; ignorarReserva?: string; tipoPreferido?: string; erro?: string;
}) {
  const ok = !!inicio && !!fim && fim > inicio;
  const { data } = useQuery({
    queryKey: ['equipamentos', 'ocupacao', inicio?.toISOString(), fim?.toISOString(), ignorarReserva], enabled: ok,
    queryFn: () => api<Ocupacao[]>(`/equipamentos/ocupacao?inicio=${inicio!.toISOString()}&fim=${fim!.toISOString()}${ignorarReserva ? `&ignorarReserva=${ignorarReserva}` : ''}`),
  });
  const lista = [...(data ?? [])].sort((a, b) => Number(b.tipo === tipoPreferido) - Number(a.tipo === tipoPreferido) || a.codigo.localeCompare(b.codigo));
  const livres = lista.filter((x) => !x.motivo);
  useEffect(() => {
    if (!data) return;
    if (!livres.some((x) => x.id === valor)) onChange((livres.find((x) => x.tipo === tipoPreferido) ?? livres[0])?.id ?? '');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const semLivre = ok && data && !livres.length;
  return (
    <Campo rotulo="Equipamento" erro={erro ?? (semLivre ? 'Nenhum equipamento livre nesse horário. Escolha outro dia ou horário.' : undefined)}>
      <select className="campo" value={valor} onChange={(e) => onChange(e.target.value)} required disabled={!ok}>
        <option value="">{ok ? 'Escolha...' : 'Informe a data e o horário primeiro'}</option>
        {lista.map((x) => (
          <option key={x.id} value={x.id} disabled={!!x.motivo}>
            {x.codigo}{x.modelo ? ` · ${x.modelo}` : ''}{x.motivo ? ` — ${x.motivo}` : ''}
          </option>
        ))}
      </select>
    </Campo>
  );
}
