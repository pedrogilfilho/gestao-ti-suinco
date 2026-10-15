-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('ativa', 'cancelada', 'retirada');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado', 'entregue');

-- CreateEnum
CREATE TYPE "DeMensagem" AS ENUM ('colab', 'ti', 'sistema');

-- AlterTable
ALTER TABLE "emprestimo" ADD COLUMN     "pedido_id" UUID,
ADD COLUMN     "reserva_id" UUID;

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL,
    "equipamento_id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "inicio_em" TIMESTAMPTZ NOT NULL,
    "fim_em" TIMESTAMPTZ NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT '',
    "finalidade_outra" TEXT NOT NULL DEFAULT '',
    "chamado_glpi" TEXT NOT NULL DEFAULT '',
    "obs" TEXT NOT NULL DEFAULT '',
    "status" "StatusReserva" NOT NULL DEFAULT 'ativa',
    "pedido_id" UUID,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "justificativa" TEXT NOT NULL DEFAULT '',
    "finalidade" TEXT NOT NULL DEFAULT '',
    "finalidade_outra" TEXT NOT NULL DEFAULT '',
    "chamado_glpi" TEXT NOT NULL DEFAULT '',
    "retirada_em" TIMESTAMPTZ NOT NULL,
    "devolucao_em" TIMESTAMPTZ,
    "acessorios" JSONB NOT NULL DEFAULT '[]',
    "obs" TEXT NOT NULL DEFAULT '',
    "assinatura_url" TEXT,
    "telefone_corp" TEXT,
    "telefone_part" TEXT,
    "status" "StatusPedido" NOT NULL DEFAULT 'pendente',
    "motivo_recusa" TEXT NOT NULL DEFAULT '',
    "mensagem_ti" TEXT NOT NULL DEFAULT '',
    "equipamento_id" UUID,
    "respondido_por_id" UUID,
    "respondido_em" TIMESTAMPTZ,
    "editado_em" TIMESTAMPTZ,
    "sem_equip_avisado_em" TIMESTAMPTZ,
    "ultima_de" "DeMensagem",
    "ultima_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_mensagem" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "de" "DeMensagem" NOT NULL,
    "autor_id" UUID,
    "texto" TEXT NOT NULL,
    "em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reserva_pedido_id_key" ON "reserva"("pedido_id");

-- CreateIndex
CREATE INDEX "reserva_pessoa_id_idx" ON "reserva"("pessoa_id");

-- CreateIndex
CREATE INDEX "pedido_pessoa_id_idx" ON "pedido"("pessoa_id");

-- CreateIndex
CREATE INDEX "pedido_status_idx" ON "pedido"("status");

-- CreateIndex
CREATE INDEX "pedido_mensagem_pedido_id_em_idx" ON "pedido_mensagem"("pedido_id", "em");

-- CreateIndex
CREATE UNIQUE INDEX "emprestimo_reserva_id_key" ON "emprestimo"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "emprestimo_pedido_id_key" ON "emprestimo"("pedido_id");

-- AddForeignKey
ALTER TABLE "emprestimo" ADD CONSTRAINT "emprestimo_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprestimo" ADD CONSTRAINT "emprestimo_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_mensagem" ADD CONSTRAINT "pedido_mensagem_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_mensagem" ADD CONSTRAINT "pedido_mensagem_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Busca de conflito de horário: só as reservas ativas e não excluídas de cada equipamento
CREATE INDEX "reserva_ativa_idx" ON "reserva"("equipamento_id", "inicio_em") WHERE "status" = 'ativa' AND "excluido_em" IS NULL;
