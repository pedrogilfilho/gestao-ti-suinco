-- AlterTable
ALTER TABLE "equipamento" ADD COLUMN     "termo_em" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "termo_link" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "equipamento_ids" UUID[],
    "itens" JSONB NOT NULL DEFAULT '[]',
    "texto" TEXT NOT NULL,
    "criado_por_id" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assinado_em" TIMESTAMPTZ,
    "assinatura_url" TEXT,
    "aplicado_em" TIMESTAMPTZ,
    "aplicado_por_id" UUID,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "termo_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "termo_link_token_key" ON "termo_link"("token");

-- AddForeignKey
ALTER TABLE "termo_link" ADD CONSTRAINT "termo_link_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

