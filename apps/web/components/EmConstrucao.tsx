// Tela provisória enquanto a tarefa dela não chega (o menu já leva até aqui).
export function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <section>
      <h1 className="mb-2 text-xl font-semibold">{titulo}</h1>
      <p className="meta">Tela em construção na reescrita.</p>
    </section>
  );
}
