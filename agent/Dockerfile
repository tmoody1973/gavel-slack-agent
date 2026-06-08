# Gavel poller — always-on machine running supercronic to fire the poll every
# 5 minutes (MOO-41). No HTTP service; supercronic is the foreground process.
FROM node:20-slim

# supercronic — a cron implementation that runs well as a container PID.
ENV SUPERCRONIC_VERSION=v0.2.33 \
    SUPERCRONIC_SHA1SUM=71b0d58cc53f6bd72cf2f293e09e294b79c666d8
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSLO "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
  && echo "${SUPERCRONIC_SHA1SUM}  supercronic-linux-amd64" | sha1sum -c - \
  && chmod +x supercronic-linux-amd64 \
  && mv supercronic-linux-amd64 /usr/local/bin/supercronic \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

CMD ["supercronic", "/app/crontab"]
