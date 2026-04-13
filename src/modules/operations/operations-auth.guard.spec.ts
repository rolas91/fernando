import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OperationsAuthGuard } from './operations-auth.guard';

type Verified = {
  userId: string;
  role: 'admin' | 'manager' | 'scheduler' | 'viewer';
};

describe('OperationsAuthGuard', () => {
  const verifyAccessToken = jest.fn<Verified | null, [string]>();

  const guard = new OperationsAuthGuard({
    verifyAccessToken,
  } as never);

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
    process.env.AUTH_DEV_BYPASS = prevEnv;
  });

  it('throws 401 when token is missing and bypass disabled', () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    const context = makeContext({
      method: 'GET',
      originalUrl: '/workers',
      headers: {},
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws 401 when token is invalid and bypass disabled', () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockReturnValueOnce(null);
    const context = makeContext({
      method: 'GET',
      originalUrl: '/workers',
      headers: { authorization: 'Bearer bad-token' },
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws 403 when viewer tries to write workers', () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockReturnValueOnce({
      userId: 'u1',
      role: 'viewer',
    });
    const context = makeContext({
      method: 'POST',
      originalUrl: '/workers',
      headers: { authorization: 'Bearer viewer-token' },
    });

    expect(() => guard.canActivate(context)).toThrow(
      'Role viewer cannot write workers',
    );
  });

  it('allows scheduler to write work-orders', () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    verifyAccessToken.mockReturnValueOnce({
      userId: 'u2',
      role: 'scheduler',
    });
    const req = {
      method: 'PATCH',
      originalUrl: '/work-orders/123',
      headers: { authorization: 'Bearer scheduler-token' },
      user: undefined as
        | { id: string; role: 'admin' | 'manager' | 'scheduler' | 'viewer' }
        | undefined,
    };
    const context = makeContext(req);

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({ id: 'u2', role: 'scheduler' });
  });

  it('allows missing token when dev bypass is enabled', () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    const context = makeContext({
      method: 'POST',
      originalUrl: '/workers',
      headers: {},
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
