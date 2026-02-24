FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile=false
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server/server.js"]
