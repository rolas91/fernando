FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && mkdir -p public && npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Optional: if frontend build is included in backend/public, backend can serve it.
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/main"]
