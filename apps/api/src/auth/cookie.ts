export const COOKIE = 'gt_sessao';
export const DOZE_HORAS = 12 * 3600_000;
export const opcoesCookie = () => ({
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DOZE_HORAS,
});
