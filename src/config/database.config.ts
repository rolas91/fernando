import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function typeOrmModuleOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', '157.230.8.225'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USER', 'postgres'),
    password: config.get<string>('DB_PASSWORD', 'J3r3m14s1.19'),
    database: config.get<string>('DB_NAME', 'fernando'),
    autoLoadEntities: true,
    synchronize: config.get<string>('NODE_ENV') !== 'production',
    logging: config.get<string>('NODE_ENV') === 'development',
  };
}
