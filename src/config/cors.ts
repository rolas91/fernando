import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const localOriginPattern =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;

function configuredOrigins() {
  return (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(origin?: string) {
  if (!origin) return true;
  if (localOriginPattern.test(origin)) return true;

  const allowedOrigins = configuredOrigins();
  if (allowedOrigins.includes('*')) return true;

  return allowedOrigins.includes(origin);
}

export function corsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  };
}
