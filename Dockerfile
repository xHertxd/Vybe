# Multi-stage Dockerfile for Vybe Backend Server
# syntax = docker/dockerfile:1.4
FROM node:20-alpine AS builder

WORKDIR /app

# Copy server directory (package files + source)
COPY server/ ./server/

# Install server dependencies
WORKDIR /app/server
RUN npm ci

# Build TypeScript
RUN npm run build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Copy server package manifests
COPY server/package.json ./
COPY server/package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled files from builder stage
COPY --from=builder /app/server/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose Render / standard port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Start server
CMD ["node", "dist/index.js"]