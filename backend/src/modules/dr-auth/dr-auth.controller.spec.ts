import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DrAuthController } from './dr-auth.controller';

describe('DrAuthController', () => {
  const service = {
    verifyAccessToken: jest.fn(),
    login: jest.fn(),
    verify: jest.fn(),
    register: jest.fn(),
    listUsers: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    updateProfile: jest.fn(),
  };

  const controller = new DrAuthController(service as never);
  const prevEnv = process.env.AUTH_DEV_BYPASS;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.AUTH_DEV_BYPASS = prevEnv;
  });

  it('throws 401 for admin actions without token when bypass disabled', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    await expect(
      controller.action({ action: 'list_users' }, { headers: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 403 for non-admin token on admin actions', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    service.verifyAccessToken.mockReturnValueOnce({
      userId: 'u1',
      role: 'manager',
    });

    await expect(
      controller.action(
        { action: 'delete_user', userId: 'u2' },
        { headers: { authorization: 'Bearer manager-token' } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin token for admin actions', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    service.verifyAccessToken.mockReturnValueOnce({
      userId: 'u-admin',
      role: 'admin',
    });
    service.listUsers.mockResolvedValueOnce({ success: true, users: [] });

    const result = await controller.action(
      { action: 'list_users' },
      { headers: { authorization: 'Bearer admin-token' } },
    );

    expect(service.listUsers).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, users: [] });
  });

  it('throws 403 when user tries to change another profile', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    service.verifyAccessToken.mockReturnValueOnce({
      userId: 'u1',
      role: 'viewer',
    });

    await expect(
      controller.action(
        { action: 'update_profile', userId: 'u2' },
        { headers: { authorization: 'Bearer viewer-token' } },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin action without token when bypass enabled', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    service.listUsers.mockResolvedValueOnce({ success: true, users: [] });

    const result = await controller.action(
      { action: 'list_users' },
      { headers: {} },
    );

    expect(result).toEqual({ success: true, users: [] });
  });
});
