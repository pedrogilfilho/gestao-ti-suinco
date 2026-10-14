# API (NestJS + Prisma). Construída a partir da raiz do repositório: docker compose -f docker/compose.yml build
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# só os manifestos primeiro (cache das dependências)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @gestao/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @gestao/shared build \
 && cd apps/api && pnpm exec prisma generate && pnpm exec nest build

WORKDIR /app/apps/api
ENV NODE_ENV=production TZ=America/Sao_Paulo
EXPOSE 3001
# aplica as migrações pendentes e sobe
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
