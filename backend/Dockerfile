# Build from the repo root: docker build -f backend/Dockerfile .
# Stage 1: build
# Debian (glibc) rather than Alpine: Blender, which renders 3D model previews, needs glibc.
# Builder and runtime share the base so native modules (bcrypt, sharp) match.
FROM node:26-trixie-slim AS builder

# Native modules (bcrypt) need a toolchain.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 g++ make \
  && rm -rf /var/lib/apt/lists/*

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
FROM node:26-trixie-slim

# curl is what the Coolify/Docker healthcheck runs inside the container.
# ffmpeg makes video/audio previews for media assets; Blender renders 3D model
# turnarounds on the CPU (Cycles). Blender adds roughly 400 MB to the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ffmpeg blender python3-numpy \
  && rm -rf /var/lib/apt/lists/* \
  && blender --version | head -1

WORKDIR /app/backend

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
# Migrations and other runtime assets that live outside dist
COPY --from=builder /app/backend/drizzle ./drizzle
# Blender script for 3D model previews (resolved relative to dist/services)
COPY --from=builder /app/backend/blender ./blender

EXPOSE 4006

# Coolify uses this instruction and ignores a dashboard healthcheck on a Dockerfile app.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl --fail --silent "http://127.0.0.1:${PORT:-4006}/health" || exit 1

CMD ["node", "dist/server.js"]
