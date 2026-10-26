# syntax=docker/dockerfile:1
# Image unique, plusieurs cibles : tools (migrations, scripts), web (Next.js standalone).
FROM node:24.16-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .

# Outils (migrations, création de l'administrateur).
FROM deps AS tools
ENV NODE_ENV=production

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @app/web build

FROM base AS web
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p /data/media && chown node:node /data/media
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
