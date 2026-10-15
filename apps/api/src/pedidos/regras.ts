import { diaSP, horaSP, proximoUtil, textoExpediente, dentroExpediente, type ConfigNucleo } from '@gestao/shared';
import { ErroNegocio } from '../comum/erros';

export const dataHoraBR = (d: Date) => `${diaSP(d).split('-').reverse().join('/')} ${horaSP(d)}`;
// fim do dia de Brasília de `d`
export const fimDoDia = (d: Date) => new Date(`${diaSP(d)}T23:59:59.999-03:00`);

// 15 → "15 min"; 60 → "1 h"; 90 → "1 h 30 min"
export function textoAntecedencia(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Antecedência e expediente do pedido normal (spec 3.3). Não vale para a TI.
export function conferirHorarios(cfg: ConfigNucleo, retirada: Date, devolucao: Date, agora = new Date()) {
  const minimo = new Date(agora.getTime() + cfg.antecedenciaMin * 60_000);
  if (retirada < minimo)
    throw new ErroNegocio(400, `A retirada precisa ser com pelo menos ${textoAntecedencia(cfg.antecedenciaMin)} de antecedência (a partir de ${dataHoraBR(minimo).replace(' ', ' às ')}), para a TI preparar o equipamento.`, 'retiradaEm');
  for (const [quando, nome, campo] of [[retirada, 'retirada', 'retiradaEm'], [devolucao, 'devolução', 'devolucaoEm']] as const) {
    if (dentroExpediente(cfg.expediente, quando)) continue;
    const pu = proximoUtil(cfg.expediente, quando);
    throw new ErroNegocio(400, `A TI está fechada nesse horário de ${nome}. Atendimento: ${textoExpediente(cfg.expediente)}.${pu ? ` Próximo horário útil: ${dataHoraBR(pu)}.` : ''}`, campo);
  }
}
