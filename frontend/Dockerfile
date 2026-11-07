# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
ARG VITE_REALTIME_URL=""
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_BUSINESS_TIME_ZONE="America/Los_Angeles"
ENV VITE_API_URL=$VITE_API_URL VITE_REALTIME_URL=$VITE_REALTIME_URL VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY VITE_BUSINESS_TIME_ZONE=$VITE_BUSINESS_TIME_ZONE
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
ENV API_UPSTREAM=api:3000
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
