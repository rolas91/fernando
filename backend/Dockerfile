FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && mkdir -p public && npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
# Empty defaults are overridable at runtime; never bake store credentials into the image.
# Store credential variables are reserved until synchronization is implemented.
ENV MOBILE_IOS_MIN_VERSION="" \
    MOBILE_IOS_STORE_URL="" \
    MOBILE_ANDROID_MIN_VERSION="" \
    MOBILE_ANDROID_STORE_URL="https://play.google.com/store/apps/details?id=com.drtrafficcontrol.mobile" \
    MOBILE_APPLE_APP_ID="" \
    MOBILE_APPLE_ISSUER_ID="" \
    MOBILE_APPLE_KEY_ID="" \
    MOBILE_APPLE_PRIVATE_KEY_BASE64="" \
    MOBILE_GOOGLE_PACKAGE_NAME="com.drtrafficcontrol.mobile" \
    MOBILE_GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=""

RUN apk add --no-cache wget

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Optional: if frontend build is included in backend/public, backend can serve it.
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1

CMD ["sh", "-c", "node dist/database/run-migrations.js && node dist/main.js"]
