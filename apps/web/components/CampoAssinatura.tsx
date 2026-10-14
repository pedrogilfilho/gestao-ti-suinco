'use client';
import { useEffect, useRef } from 'react';

// Assinatura desenhada com o dedo/mouse. Fundo branco fixo (também no tema escuro),
// para a assinatura sair legível no PDF dos termos. Devolve o PNG em base64.
export function CampoAssinatura({ rotulo, onChange }: { rotulo: string; onChange: (png: string | undefined) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;

  const pintarFundo = () => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
  };

  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!;
    const escala = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * escala; c.height = 160 * escala; ctx.scale(escala, escala);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    pintarFundo();
    let desenhando = false, rabiscou = false;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const down = (e: PointerEvent) => { desenhando = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); };
    const move = (e: PointerEvent) => { if (!desenhando) return; ctx.lineTo(...pos(e)); ctx.stroke(); rabiscou = true; };
    const up = () => { if (desenhando && rabiscou) aoMudar.current(c.toDataURL('image/png')); desenhando = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); };
  }, []);

  const limpar = () => { pintarFundo(); onChange(undefined); };
  return (
    <fieldset>
      <legend className="rotulo">{rotulo}</legend>
      <canvas ref={ref} aria-label={rotulo} className="h-40 w-full touch-none rounded border bg-white" />
      <button type="button" className="link text-sm" onClick={limpar}>Limpar</button>
    </fieldset>
  );
}
