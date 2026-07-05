FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY mocks ./mocks
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY mocks ./mocks
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
COPY sql ./sql
COPY scripts ./scripts
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.cjs"]
