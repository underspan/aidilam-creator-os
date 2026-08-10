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

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for video pipeline
RUN pip3 install --break-system-packages --no-cache-dir \
    faster-whisper==1.2.1 \
    edge-tts==7.2.8 \
    deep-translator==1.11.4

# Pre-download whisper tiny model to /opt/models (accessible by all)
ENV HF_HOME=/opt/models/hf_cache
RUN mkdir -p /opt/models/hf_cache && \
    python3 -c "from faster_whisper import WhisperModel; WhisperModel('tiny', compute_type='int8', device='cpu')" && \
    chmod -R 755 /opt/models

# Copy runtime scripts
COPY runtime/ /opt/aidilam-studio/runtime/

# Runtime env for model cache
ENV XDG_CACHE_HOME=/tmp/cache

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/false appuser

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 3001

CMD ["node", "dist/index.js"]
