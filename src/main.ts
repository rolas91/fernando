import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'fs';
import type { NextFunction, Request, Response } from 'express';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import { ensureRuntimeEnv } from './config/ensure-env';

function isSwaggerEnabled() {
  const flag = (process.env.SWAGGER_ENABLED ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(flag)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(flag)) return false;
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}

function shouldServeFrontend() {
  const defaultValue =
    (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'
      ? 'true'
      : 'false';
  const flag = (process.env.SERVE_FRONTEND ?? defaultValue)
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(flag);
}

async function bootstrap() {
  ensureRuntimeEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  app.setGlobalPrefix('api');
  expressApp.get('/healthz', (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok' });
  });
  app.enableCors({
    origin:
      process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ??
      true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredDistPath = process.env.FRONTEND_DIST_PATH?.trim();
  const candidateDistPaths = [
    configuredDistPath,
    resolve(process.cwd(), 'public'),
    resolve(process.cwd(), '../frontend/dist'),
  ].filter((x): x is string => Boolean(x));
  const frontendDistPath =
    candidateDistPaths.find((candidate) => existsSync(candidate)) ||
    candidateDistPaths[0];
  if (shouldServeFrontend()) {
    if (existsSync(frontendDistPath)) {
      const indexFilePath = join(frontendDistPath, 'index.html');
      const apiPrefixes = [
        '/api',
        '/docs',
        '/docs-json',
        '/realtime',
        '/socket.io',
      ];

      app.useStaticAssets(frontendDistPath);
      expressApp.use((req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET') return next();
        if (
          apiPrefixes.some(
            (prefix) =>
              req.path === prefix || req.path.startsWith(`${prefix}/`),
          )
        ) {
          return next();
        }
        return res.sendFile(indexFilePath);
      });

      console.log(`🖥️ Serving frontend static files from: ${frontendDistPath}`);
    } else {
      console.warn(
        `⚠️ SERVE_FRONTEND enabled but dist not found: ${frontendDistPath}`,
      );
      expressApp.get('/', (_req: Request, res: Response) => {
        return res
          .status(200)
          .send('Backend running. Frontend build not found.');
      });
    }
  }

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Fernando API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    // Raw OpenAPI JSON (útil para debug)
    SwaggerModule.setup('docs-json', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API corriendo en: http://localhost:${port}/api`);
  console.log(`📚 Swagger docs en: http://localhost:${port}/docs`);
  console.log(`❤️ Healthcheck en: http://localhost:${port}/healthz`);
}

void bootstrap();
