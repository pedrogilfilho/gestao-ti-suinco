-- CreateTable
CREATE TABLE "ramal" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "setor" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "ramal_pkey" PRIMARY KEY ("id")
);

