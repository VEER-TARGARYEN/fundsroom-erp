# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Prisma 6's query engine needs OpenSSL on Debian slim.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
# `npm run build` runs `prisma generate` then `tsc`.
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS production
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# Full node_modules (incl. the generated Prisma client + the prisma CLI used by
# the entrypoint to apply the schema) is copied from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
