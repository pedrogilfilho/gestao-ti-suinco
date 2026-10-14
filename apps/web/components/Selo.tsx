import type { Situacao } from '@gestao/shared';

export const Selo = ({ s }: { s: Situacao }) => <span className={`selo ${s.cls}`}>{s.txt}</span>;
