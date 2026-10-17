# Cloud deployment: npm/Next build + isolated raster/vector conversion service.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ghostscript inkscape ca-certificates fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/server_tools ./server_tools
RUN python3 -m venv /opt/fontvenv && \
    /opt/fontvenv/bin/pip install --no-cache-dir -r server_tools/requirements.txt
ENV PATH="/opt/fontvenv/bin:${PATH}" \
    PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 8080
CMD ["node","server.js"]
