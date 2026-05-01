FROM node:20-alpine

# Installer pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copier les fichiers de lock et le workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Installer les dépendances
RUN pnpm install --frozen-lockfile

# Générer le client Prisma
WORKDIR /app/apps/api
RUN pnpm db:generate

# Build l'API
WORKDIR /app
RUN pnpm --filter @prospect-ai/api build

EXPOSE 4000

# Démarrer l'API
CMD ["pnpm", "--filter", "@prospect-ai/api", "start:prod"]
