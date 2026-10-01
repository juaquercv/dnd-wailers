# D&D Wailers: one image that serves the API, Socket.IO and the compiled client.

# ---------------------------------------------------------------------------
# Build stage: install workspaces, generate Prisma client, build client + server
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
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    UPLOADS_DIR=/data/uploads

COPY --from=build /app /app
RUN mkdir -p /data/uploads

EXPOSE 3000

# Apply pending migrations, then start the server (seeding is automatic and idempotent).
CMD ["sh", "-c", "npx prisma migrate deploy --schema server/prisma/schema.prisma && node server/dist/index.js"]
