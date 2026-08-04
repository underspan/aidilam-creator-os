# Build stage
FROM node:22.16-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:22.16-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false appuser

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
