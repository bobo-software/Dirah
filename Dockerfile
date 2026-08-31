# syntax=docker/dockerfile:1.7
# Vite/rolldown require Node 20.19+ or 22.12+
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* into the client bundle at build time.
ARG VITE_API_URL

ENV VITE_API_URL=$VITE_API_URL

RUN if [ -z "$VITE_API_URL" ]; then \
      echo "Missing VITE_API_URL build arg."; \
      exit 1; \
    fi

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 83

CMD ["nginx", "-g", "daemon off;"]
