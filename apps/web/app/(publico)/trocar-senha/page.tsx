'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErroApi } from '@/lib/api';
import { inicioDe, type Eu } from '@/lib/sessao';

export default function TrocarSenha() {
  const router = useRouter();
  const qc = useQueryClient();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function trocar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    if (f.get('nova') !== f.get('confirmar')) return setErro('As senhas não conferem.');
    setErro('');
    setEnviando(true);
    try {
      await api('/auth/trocar-senha', { metodo: 'POST', corpo: { atual: f.get('atual'), nova: f.get('nova') } });
      await qc.invalidateQueries({ queryKey: ['eu'] });
      router.replace(inicioDe(await api<Eu>('/auth/eu')));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.mensagem : 'Não foi possível trocar a senha.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-2 text-2xl font-semibold">Troque sua senha</h1>
      <p className="meta mb-6">Para continuar, crie uma senha só sua: pelo menos 8 caracteres e um número.</p>
      <form onSubmit={trocar} className="card space-y-4">
        <label className="rotulo">Senha atual (a temporária)
          <input name="atual" type="password" autoComplete="current-password" required className="campo" />
        </label>
        <label className="rotulo">Nova senha
          <input name="nova" type="password" autoComplete="new-password" required minLength={8} className="campo" />
        </label>
        <label className="rotulo">Repita a nova senha
          <input name="confirmar" type="password" autoComplete="new-password" required className="campo" />
        </label>
        {erro && <p role="alert" className="text-sm text-[var(--late)]">{erro}</p>}
        <button className="btn w-full" disabled={enviando}>Salvar e entrar</button>
      </form>
    </main>
  );
}
