# D&D Wailers: one image that serves the API, Socket.IO and the compiled client.

# ---------------------------------------------------------------------------
# Build stage: install every workspace, generate Prisma client, build client + server
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Manifests first so dependency installation is cached between source changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json

# npm install (not npm ci) tolerates a lockfile generated on another OS (native optional deps).
RUN npm install --no-audit --no-fund

COPY . .

RUN npx prisma generate --schema server/prisma/schema.prisma
RUN npm run build -w client && npm run build -w server

# ---------------------------------------------------------------------------
# Production dependencies only (server runtime: fastify, socket.io, prisma, zod)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY server/prisma server/prisma

RUN npm install --omit=dev --workspace server --no-audit --no-fund \
  && node node_modules/prisma/build/index.js generate --schema server/prisma/schema.prisma \
  && npm cache clean --force

# ---------------------------------------------------------------------------
# Runtime stage: compiled server + compiled client + production node_modules
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOADS_DIR=/data/uploads \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data/uploads

EXPOSE 3000

# Apply pending migrations, then start the server (seeding is automatic and idempotent).
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema server/prisma/schema.prisma && node server/dist/index.js"]
