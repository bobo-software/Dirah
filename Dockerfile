# Stage 1: Build Stage (Uses full Alpine with required build tools)
FROM node:26-alpine AS builder

# Install dependencies for native modules (bcrypt, mysql2, etc.)
RUN apk add --no-cache python3 g++ make

WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Coolify may inject NODE_ENV=production at build time, which would skip
# typescript and other build tools. Force install of devDependencies.
RUN npm ci --include=dev

# Copy the rest of the source code
COPY . .

# Build TypeScript project (uses local typescript, not the wrong npx "tsc" package)
RUN npm run build

# Drop build-only packages before copying into the runtime image
RUN npm prune --omit=dev

# Stage 2: Production Stage (Uses a minimal Alpine image)
FROM node:26-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Migrations and other runtime assets that live outside dist
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 4002

CMD ["node", "dist/server.js"]