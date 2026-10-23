# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f frontend/Dockerfile .
# Vite/rolldown require Node 20.19+ or 22.12+
FROM node:20-alpine AS build

WORKDIR /app

# Used only while `npm run build` runs. The nginx stage does not call Infisical.
RUN npm install -g @infisical/cli@0.43.138 && npm cache clean --force

# The root lockfile covers every workspace, so npm ci needs both manifests.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend

COPY frontend/ ./frontend/

# Vite bakes VITE_* into the client bundle at build time.
# VITE_PUBLIC_API_URL is the API origin shown to users (MCP); the browser calls
# its own origin and nginx proxies /api. VITE_API_URL is an optional override.
# Coolify can pass them as build args, or set the three Infisical vars so this
# stage loads secrets before the build. A BuildKit secret named infisical_token
# wins over the INFISICAL_TOKEN build arg.
ARG VITE_PUBLIC_API_URL
ARG VITE_API_URL
ARG INFISICAL_TOKEN
ARG INFISICAL_ENV
ARG INFISICAL_DOMAIN

ENV VITE_PUBLIC_API_URL=$VITE_PUBLIC_API_URL
ENV VITE_API_URL=$VITE_API_URL
ENV INFISICAL_TOKEN=$INFISICAL_TOKEN
ENV INFISICAL_ENV=$INFISICAL_ENV
ENV INFISICAL_DOMAIN=$INFISICAL_DOMAIN

WORKDIR /app/frontend

RUN chmod +x scripts/docker-build.sh scripts/vite-build.sh
RUN --mount=type=secret,id=infisical_token,required=false \
    ./scripts/docker-build.sh

FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 83

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:83/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
