-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('master', 'tic', 'consulta', 'solicitante');

-- CreateEnum
CREATE TYPE "SituacaoEquip" AS ENUM ('ativo', 'manutencao', 'danificado', 'extraviado', 'baixado');

-- CreateEnum
CREATE TYPE "IpTipo" AS ENUM ('dhcp', 'fixo');

-- CreateEnum
CREATE TYPE "TermoStatus" AS ENUM ('assinado', 'nao_assinado', 'nao_informado');

-- CreateTable
CREATE TABLE "setor" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "setor_id" UUID NOT NULL,
    "telefone_corp" TEXT,
    "telefone_part" TEXT,
    "login" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "assinatura_url" TEXT,
    "foto_url" TEXT,
    "limites" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo_acesso" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "permissoes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "grupo_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso" (
    "id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "papel" "Papel" NOT NULL,
    "grupo_id" UUID,
    "permissoes" JSONB NOT NULL DEFAULT '{}',
    "suspenso" BOOLEAN NOT NULL DEFAULT false,
    "revogado_em" TIMESTAMPTZ,
    "ultimo_login_em" TIMESTAMPTZ,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial_local" (
    "acesso_id" UUID NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "trocar_no_proximo_login" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credencial_local_pkey" PRIMARY KEY ("acesso_id")
);

-- CreateTable
CREATE TABLE "tentativa_login" (
    "email" TEXT NOT NULL,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "travado_ate" TIMESTAMPTZ,

    CONSTRAINT "tentativa_login_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "equipamento" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "modelo" TEXT NOT NULL DEFAULT '',
    "patrimonio" TEXT NOT NULL DEFAULT '',
    "serie" TEXT NOT NULL DEFAULT '',
    "situacao" "SituacaoEquip" NOT NULL DEFAULT 'ativo',
    "somente_cadastro" BOOLEAN NOT NULL DEFAULT false,
    "pessoa_id" UUID,
    "vinculo_livre" TEXT NOT NULL DEFAULT '',
    "vinculado_em" TIMESTAMPTZ,
    "setor_id" UUID,
    "ip_tipo" "IpTipo",
    "ip" TEXT,
    "mac" TEXT,
    "numero_corp" TEXT,
    "numero_part" TEXT,
    "tipo_chip" TEXT NOT NULL DEFAULT '',
    "termo_status" "TermoStatus" NOT NULL DEFAULT 'nao_informado',
    "termo_obs" TEXT NOT NULL DEFAULT '',
    "garantia_ate" DATE,
    "predio" TEXT NOT NULL DEFAULT '',
    "ponto_rede" TEXT NOT NULL DEFAULT '',
    "firmware" TEXT NOT NULL DEFAULT '',
    "trocas_cabeca" INTEGER,
    "licencas" JSONB NOT NULL DEFAULT '[]',
    "data_ativacao" DATE,
    "obs" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emprestimo" (
    "id" UUID NOT NULL,
    "equipamento_id" UUID NOT NULL,
    "pessoa_id" UUID NOT NULL,
    "tecnico_id" UUID,
    "finalidade" TEXT NOT NULL,
    "finalidade_outra" TEXT NOT NULL DEFAULT '',
    "chamado_glpi" TEXT NOT NULL DEFAULT '',
    "retirada_em" TIMESTAMPTZ NOT NULL,
    "previsao_em" TIMESTAMPTZ,
    "devolvido_em" TIMESTAMPTZ,
    "acessorios" JSONB NOT NULL DEFAULT '[]',
    "acessorios_devolvidos" JSONB NOT NULL DEFAULT '[]',
    "acessorios_faltando" JSONB NOT NULL DEFAULT '[]',
    "assinatura_retirada_url" TEXT,
    "assinatura_devolucao_url" TEXT,
    "obs" TEXT NOT NULL DEFAULT '',
    "obs_devolucao" TEXT NOT NULL DEFAULT '',
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,
    "excluido_em" TIMESTAMPTZ,

    CONSTRAINT "emprestimo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator_id" UUID,
    "acao" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "item_id" TEXT,
    "antes" JSONB,
    "depois" JSONB,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "grupo_acesso_nome_key" ON "grupo_acesso"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "acesso_pessoa_id_key" ON "acesso"("pessoa_id");

-- CreateIndex
CREATE INDEX "auditoria_area_em_idx" ON "auditoria"("area", "em");

-- CreateIndex
CREATE INDEX "auditoria_item_id_idx" ON "auditoria"("item_id");

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo_acesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_local" ADD CONSTRAINT "credencial_local_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprestimo" ADD CONSTRAINT "emprestimo_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprestimo" ADD CONSTRAINT "emprestimo_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprestimo" ADD CONSTRAINT "emprestimo_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unicidade só entre os não excluídos (exclusão lógica)
CREATE UNIQUE INDEX setor_nome_ativo ON setor (lower(nome)) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX pessoa_email_ativo ON pessoa (email) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX equipamento_codigo_ativo ON equipamento (lower(codigo)) WHERE excluido_em IS NULL;
-- No máximo um empréstimo aberto por equipamento (protege contra dois registros ao mesmo tempo)
CREATE UNIQUE INDEX emprestimo_aberto_por_equipamento ON emprestimo (equipamento_id) WHERE devolvido_em IS NULL AND excluido_em IS NULL;
