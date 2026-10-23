# Build from the repo root: docker build -f frontend/Dockerfile .
# Matches .nvmrc and the API image. Vite/rolldown need 20.19+ or 22.12+.
FROM node:26-alpine AS build

WORKDIR /app

# The root lockfile covers every workspace, so npm ci needs both manifests.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include=dev

COPY frontend/ ./frontend/

# Vite bakes VITE_* into the client bundle at build time.
# VITE_PUBLIC_API_URL is the API origin shown to users (MCP); the browser calls
# its own origin and nginx proxies /api. VITE_API_URL is an optional override.
ARG VITE_PUBLIC_API_URL
ARG VITE_API_URL

ENV VITE_PUBLIC_API_URL=$VITE_PUBLIC_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/frontend

RUN chmod +x scripts/vite-build.sh
RUN ./scripts/vite-build.sh

FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 83

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:83/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
