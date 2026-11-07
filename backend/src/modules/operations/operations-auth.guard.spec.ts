import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OperationsAuthGuard } from './operations-auth.guard';

type Verified = { sub: string };

describe('OperationsAuthGuard', () => {
  const verifyAccessToken = jest.fn<Verified | null, [string]>();
  const getUserAccessContext = jest.fn();

  const guard = new OperationsAuthGuard(
    {
      verifyAccessToken,
    } as never,
    { getUserAccessContext } as never,
  );

  const makeContext = (req: {
    method: string;
    originalUrl?: string;
    headers: Record<string, string | undefined>;
    user?: { id: string; role: 'admin' | 'manager' | 'scheduler' | 'viewer' };
  }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as ExecutionContext;

  const prevEnv = process.env.AUTH_DEV_BYPASS;

  afterEach(() => {
    verifyAccessToken.mockReset();
    getUserAccessContext.mockReset();
    process.env.AUTH_DEV_BYPASS = prevEnv;
  });

  it('throws 401 when token is missing and bypass disabled', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    const context = makeContext({
      method: 'GET',
      originalUrl: '/workers',
      headers: {},
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 when token is invalid and bypass disabled', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockImplementationOnce(() => {
      throw new Error('invalid token');
    });
    const context = makeContext({
      method: 'GET',
      originalUrl: '/workers',
      headers: { authorization: 'Bearer bad-token' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 403 when viewer tries to write workers', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockReturnValueOnce({
      sub: 'u1',
    });
    getUserAccessContext.mockResolvedValueOnce({
      id: 'u1',
      email: 'viewer@example.com',
      role: 'viewer',
      roles: ['viewer'],
      permissions: ['workers.read'],
    });
    const context = makeContext({
      method: 'POST',
      originalUrl: '/workers',
      headers: { authorization: 'Bearer viewer-token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'User viewer@example.com cannot write workers',
    );
  });

  it('allows scheduler to write work-orders', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockReturnValueOnce({
      sub: 'u2',
    });
    const scheduler = {
      id: 'u2',
      email: 'scheduler@example.com',
      role: 'scheduler',
      roles: ['scheduler'],
      permissions: ['work-orders.write'],
    };
    getUserAccessContext.mockResolvedValueOnce(scheduler);
    const req = {
      method: 'PATCH',
      originalUrl: '/work-orders/123',
      headers: { authorization: 'Bearer scheduler-token' },
      user: undefined as
        | { id: string; role: 'admin' | 'manager' | 'scheduler' | 'viewer' }
        | undefined,
    };
    const context = makeContext(req);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual(scheduler);
  });

  it('allows missing token when dev bypass is enabled', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    const context = makeContext({
      method: 'POST',
      originalUrl: '/workers',
      headers: {},
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
