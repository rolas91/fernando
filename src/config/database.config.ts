import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function typeOrmModuleOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const nodeEnv = (
    config.get<string>('NODE_ENV', 'development') || 'development'
  ).toLowerCase();
  const synchronizeOverride = parseBooleanFlag(
    config.get<string>('DB_SYNCHRONIZE'),
  );
  const loggingOverride = parseBooleanFlag(config.get<string>('DB_LOGGING'));

  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', '157.230.8.225'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USER', 'postgres'),
    password: config.get<string>('DB_PASSWORD', 'J3r3m14s1.19'),
    database: config.get<string>('DB_NAME', 'fernando'),
    autoLoadEntities: true,
    synchronize:
      synchronizeOverride !== undefined
        ? synchronizeOverride
        : nodeEnv !== 'production',
    logging:
      loggingOverride !== undefined ? loggingOverride : nodeEnv === 'development',
  };
}
