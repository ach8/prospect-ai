FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile

WORKDIR /app
RUN pnpm --filter @prospect-ai/web build

EXPOSE 3000

CMD ["pnpm", "--filter", "@prospect-ai/web", "start"]
