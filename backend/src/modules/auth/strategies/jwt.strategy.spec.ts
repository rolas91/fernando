import { JwtStrategy } from './jwt.strategy';
import { Request } from 'express';

describe('JWT web access revalidation', () => {
  const users = {
    findById: jest.fn().mockResolvedValue({ id: 'u1', status: 'active' }),
  };
  const access = { getUserAccessContext: jest.fn() };
  const strategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
  Object.assign(strategy, { users, access });
  const validate = (
    req: Request,
    payload: Pick<Parameters<JwtStrategy['validate']>[1], 'sub' | 'platform'>,
  ) => strategy.validate(req, { email: 'worker@example.com', ...payload });
  beforeEach(() =>
    access.getUserAccessContext.mockResolvedValue({
      role: 'viewer',
      roles: ['viewer'],
      webAccessEnabled: false,
    }),
  );
  it('rejects a signed web session after access is revoked', async () => {
    await expect(
      validate({ headers: {} } as Request, { sub: 'u1', platform: 'web' }),
    ).rejects.toThrow('Web panel access is disabled');
  });
  it('checks old tokens when the web restores its session', async () => {
    await expect(
      validate(
        { headers: { 'x-client-platform': 'web' } } as unknown as Request,
        { sub: 'u1' },
      ),
    ).rejects.toThrow('Web panel access is disabled');
  });
  it('preserves old app sessions', async () => {
    await expect(
      validate({ headers: {} } as Request, { sub: 'u1' }),
    ).resolves.toHaveProperty('role', 'viewer');
  });
  it('always permits administrators', async () => {
    access.getUserAccessContext.mockResolvedValue({
      role: 'admin',
      roles: ['admin'],
      webAccessEnabled: false,
    });
    await expect(
      validate({ headers: {} } as Request, { sub: 'u1', platform: 'web' }),
    ).resolves.toHaveProperty('role', 'admin');
  });
});
