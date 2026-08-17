import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService login', () => {
  const accessContext = {
    id: 'user-1',
    email: 'worker@example.com',
    firstName: 'Test',
    lastName: 'Worker',
    phone: '',
    avatarUrl: '',
    status: 'active',
    lastLogin: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    role: 'viewer',
    roles: ['viewer'],
    permissions: [],
  };
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    touchLastLogin: jest.fn(),
  };
  const access = {
    ensureRoleExists: jest.fn(),
    assignRoleToUser: jest.fn(),
    getUserAccessContext: jest.fn().mockResolvedValue(accessContext),
  };
  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const tokenService = {
    signAccessToken: jest.fn().mockReturnValue('token'),
  };
  const service = new AuthService(
    users as never,
    access as never,
    { get: jest.fn() } as never,
    passwordHasher as never,
    tokenService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the same generic rejection for an unknown email and bad password', async () => {
    users.findByEmail.mockResolvedValueOnce(null);
    await expect(service.login('missing@example.com', 'bad')).rejects.toEqual(
      new UnauthorizedException('Invalid email or password'),
    );

    users.findByEmail.mockResolvedValueOnce({
      id: 'user-1',
      passwordHash: 'hash',
      status: 'active',
    });
    passwordHasher.compare.mockResolvedValueOnce(false);
    await expect(service.login('worker@example.com', 'bad')).rejects.toEqual(
      new UnauthorizedException('Invalid email or password'),
    );
  });

  it('rejects an inactive account only after the password is validated', async () => {
    users.findByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'worker@example.com',
      passwordHash: 'hash',
      status: 'inactive',
    });
    passwordHasher.compare.mockResolvedValueOnce(true);

    await expect(
      service.login('worker@example.com', 'correct'),
    ).rejects.toEqual(new ForbiddenException('Account unavailable'));
    expect(users.touchLastLogin).not.toHaveBeenCalled();
  });

  it('issues a session for an active account', async () => {
    users.findByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'worker@example.com',
      passwordHash: 'hash',
      status: 'active',
    });
    passwordHasher.compare.mockResolvedValueOnce(true);

    await expect(
      service.login('worker@example.com', 'correct'),
    ).resolves.toEqual({
      access_token: 'token',
      user: accessContext,
    });
    expect(users.touchLastLogin).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
    );
  });
});
