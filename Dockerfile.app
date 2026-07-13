# Gavel interactive app (MOO-70) — always-on Bolt worker in Socket Mode.
# Bundles agent/ (the Bolt app) + mcp-server/ (the milwaukee-civic MCP server
# the agent spawns over stdio). No HTTP port — Socket Mode dials out to Slack.
# Build context is the repo root so both sibling packages are available.
FROM node:20-slim
WORKDIR /app

# clip_video_moment cuts the real footage out of the Granicus webcast and posts it into the
# thread: ffmpeg range-seeks the archive MP4, and yt-dlp resolves the archive URL (it is only
# the extractor — its downloader is broken on Granicus's player page). Static yt-dlp binary,
# so no Python in the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Install prod deps for both packages first, for layer caching.
COPY agent/package*.json ./agent/
COPY mcp-server/package*.json ./mcp-server/
RUN cd agent && npm ci --omit=dev && cd ../mcp-server && npm ci --omit=dev

# Source (node_modules / .env excluded via .dockerignore). The agent resolves
# the MCP server at ../../mcp-server/src/server.js relative to agent/agent/agent.js,
# so the repo-root layout (/app/agent + /app/mcp-server) must be preserved.
COPY agent ./agent
COPY mcp-server ./mcp-server

# The agent runs the Claude Code SDK, which refuses --dangerously-skip-permissions
# (permissionMode 'bypassPermissions') when running as root. Run as the unprivileged
# 'node' user (uid 1000, present in the base image) so the agent loop is allowed.
RUN chown -R node:node /app
USER node
ENV HOME=/home/node

WORKDIR /app/agent
CMD ["node", "app.js"]
