ARG NODE_VERSION=24

# Base image for all stages
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable


FROM base AS pruner
WORKDIR /app
ARG APP_NAME

RUN pnpm add -g turbo
COPY . .
RUN turbo prune ${APP_NAME} --docker


FROM base AS builder
WORKDIR /app
ARG APP_NAME

COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter ${APP_NAME}...

RUN pnpm --filter ${APP_NAME} deploy --prod --legacy /prod-app


FROM node:${NODE_VERSION}-alpine AS runner

RUN apk add --no-cache dumb-init openssl

ENV NODE_ENV=production
ENV SERVER_PORT=8080

WORKDIR /prod-app

COPY --chown=node:node --from=builder /prod-app .

# to include prisma cli installation
RUN npx prisma@6 format --check --schema ./dist/db/prisma/schema.prisma

USER node
WORKDIR /prod-app/dist
EXPOSE 8080
CMD ["dumb-init", "node", "--max_old_space_size=512", "--import", "./instrumentation.mjs", "./index.js"]
