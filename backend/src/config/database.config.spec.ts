import { typeOrmModuleOptions } from './database.config';
const options = (values: Record<string, string | number> = {}) =>
  typeOrmModuleOptions({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as never);
describe('database connection configuration', () => {
  it('defaults to a local connection without an embedded password', () => {
    const result = options({ NODE_ENV: 'production' });
    expect(result).toMatchObject({ host: '127.0.0.1', synchronize: false });
    expect(result).toHaveProperty('password', undefined);
  });
  it('retains explicitly configured connection settings', () => {
    const result = options({
      NODE_ENV: 'production',
      DB_HOST: 'database.internal',
      DB_PORT: 6543,
      DB_USER: 'configured-user',
      DB_PASSWORD: 'configured-test-password',
      DB_NAME: 'configured-database',
    });
    expect(result).toMatchObject({
      host: 'database.internal',
      port: 6543,
      username: 'configured-user',
      password: 'configured-test-password',
      database: 'configured-database',
    });
  });
  it('retains the explicit schema/logging overrides used by local and container launchers', () => {
    expect(
      options({
        NODE_ENV: 'development',
        DB_SYNCHRONIZE: 'false',
        DB_LOGGING: 'false',
      }),
    ).toMatchObject({ synchronize: false, logging: false });
  });
});
