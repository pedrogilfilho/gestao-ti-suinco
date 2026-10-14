export class ErroApi extends Error {
  constructor(public status: number, public mensagem: string, public campo?: string, public codigo?: string) {
    super(mensagem);
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// Chamada à API (mesmo endereço: o cookie do login vai junto). 401 leva ao login, guardando onde a pessoa estava.
export async function api<T>(caminho: string, o: { metodo?: Metodo; corpo?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${caminho}`, {
    method: o.metodo ?? 'GET',
    credentials: 'same-origin',
    headers: o.corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined,
  });
  const corpo = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (r.status === 401 && !caminho.startsWith('/auth/login') && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?voltar=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!r.ok) throw new ErroApi(r.status, corpo?.mensagem ?? 'Erro inesperado. Tente de novo.', corpo?.campo, corpo?.codigo);
  return corpo as T;
}
