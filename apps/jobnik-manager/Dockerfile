FROM node:24 AS build

WORKDIR /tmp/buildApp

COPY ./package*.json ./
COPY .husky/ .husky/

RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine AS production

RUN apk add --no-cache dumb-init openssl

ENV NODE_ENV=production
ENV SERVER_PORT=8080


WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
COPY .husky/ .husky/
COPY --chown=node:node ./src/db/prisma/schema.prisma ./db/prisma/schema.prisma
COPY --chown=node:node ./src/db/prisma/migrations ./db/prisma/migrations

RUN npm ci --only=production

COPY --chown=node:node --from=build /tmp/buildApp/dist .
COPY --chown=node:node ./config ./config

# to include prisma cli installation 
RUN npx prisma format --check --schema ./db/prisma/schema.prisma

USER node
EXPOSE 8080
CMD ["dumb-init", "node", "--max_old_space_size=512", "--import", "./instrumentation.mjs", "./index.js"]
