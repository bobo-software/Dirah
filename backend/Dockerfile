# Build from the repo root: docker build -f backend/Dockerfile .
# Stage 1: build
FROM node:26-alpine AS builder

# Native modules (bcrypt) need a toolchain.
RUN apk add --no-cache python3 g++ make

WORKDIR /app

# The root lockfile covers every workspace, so npm ci needs both manifests.
COPY package.json package-lock.json ./
COPY backend/package.json backend/

RUN npm ci --workspace backend --include=dev

COPY backend/ ./backend/

RUN npm run build --workspace backend
# Drop build-only packages, then make sure the nested folder exists for COPY.
RUN npm prune --omit=dev --workspace backend && mkdir -p backend/node_modules

# Stage 2: runtime
FROM node:26-alpine

# Secrets are injected at start by the CLI. The app never calls Infisical itself.
# Pin matches the npm package; the preinstall script downloads the platform binary.
# curl is what the Coolify/Docker healthcheck runs inside the container.
RUN apk add --no-cache curl \
  && npm install -g @infisical/cli@0.43.138 \
  && npm cache clean --force

WORKDIR /app/backend

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
# Migrations and other runtime assets that live outside dist
COPY --from=builder /app/backend/drizzle ./drizzle
COPY backend/scripts/infisical-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4006

# Coolify uses this instruction and ignores a dashboard healthcheck on a Dockerfile app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl --fail --silent "http://127.0.0.1:${PORT:-4006}/health" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
