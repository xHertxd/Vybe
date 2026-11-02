FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

RUN npm install

COPY client/ ./client/
COPY server/ ./server/

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

COPY package*.json ./
COPY server/package*.json ./server/

RUN npm install --prefix server --omit=dev

COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 10000

CMD ["node", "server/dist/index.js"]
