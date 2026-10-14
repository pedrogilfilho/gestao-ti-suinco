import { z } from 'zod';
import { DOMINIO_EMAIL } from '../constantes.js';

export const textoOpcional = z.string().trim().max(500).optional().default('');

// e-mail digitado sem "@" é completado com o domínio da Suinco (como no app atual)
const completarDominio = (v: unknown) =>
  typeof v === 'string' && v.trim() && !v.includes('@') ? v.trim() + DOMINIO_EMAIL : v;

export const emailSchema = z.preprocess(
  completarDominio,
  z.string({ required_error: 'Informe o e-mail.' }).trim().toLowerCase()
    .email('E-mail inválido.')
    .refine((e) => e.endsWith(DOMINIO_EMAIL), 'O e-mail precisa terminar em @suinco.com.br.'),
);
export const emailQualquerSchema = z.string({ required_error: 'Informe o e-mail.' }).trim().toLowerCase().email('E-mail inválido.');

export const telefoneSchema = z.string().transform((v, ctx) => {
  const d = v.replace(/\D/g, '');
  if (d.length !== 10 && d.length !== 11) {
    ctx.addIssue({ code: 'custom', message: 'Telefone inválido. Use DDD e número, por exemplo (34) 99999-9999.' });
    return z.NEVER;
  }
  const ddd = d.slice(0, 2), resto = d.slice(2);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
});
// vazio = sem telefone
export const telefoneOpcional = z.union([z.literal('').transform(() => undefined), telefoneSchema]).optional();

export const imagemBase64 = z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Assinatura inválida.').max(400_000);
// foto: a tela reduz para 256 px; aqui aceita PNG ou JPEG de até ~200 KB
export const fotoBase64 = z.string().regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'A foto precisa ser uma imagem PNG ou JPEG.').max(270_000, 'Foto grande demais.');

export const dataHora = z.coerce.date({ errorMap: () => ({ message: 'Data inválida.' }) });
export const uuidObrigatorio = (msg: string) => z.string({ required_error: msg, invalid_type_error: msg }).uuid(msg);
