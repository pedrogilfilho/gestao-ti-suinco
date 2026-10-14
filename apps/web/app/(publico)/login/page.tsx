'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { inicioDe, type Eu } from '@/lib/sessao';

function FormLogin() {
  const router = useRouter();
  const voltar = useSearchParams().get('voltar');
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setErro('');
    setEnviando(true);
    try {
      await api('/auth/login', { metodo: 'POST', corpo: { email: f.get('email'), senha: f.get('senha') } });
      qc.clear();
      const eu = await api<Eu>('/auth/eu');
      // "voltar" só para caminhos internos
      const destino = !eu.trocarSenha && voltar?.startsWith('/') && !voltar.startsWith('//') ? voltar : inicioDe(eu);
      router.replace(destino);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="card space-y-4">
      <label className="rotulo">E-mail
        <input name="email" type="email" autoComplete="username" required className="campo" />
      </label>
      <label className="rotulo">Senha
        <input name="senha" type="password" autoComplete="current-password" required className="campo" />
      </label>
      {erro && <p role="alert" className="text-sm text-[var(--late)]">{erro}</p>}
      <button className="btn w-full" disabled={enviando}>Entrar</button>
    </form>
  );
}

export default function Login() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Gestão de TI · Suinco</h1>
      <Suspense><FormLogin /></Suspense>
    </main>
  );
}
