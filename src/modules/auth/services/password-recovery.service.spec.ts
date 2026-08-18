import { BadRequestException } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { PasswordResetToken } from '../../../entities/password-reset-token.entity';
import { User } from '../../../entities/user.entity';
import { PasswordRecoveryService } from './password-recovery.service';

jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    setApiKey: jest.fn(),
    send: jest.fn(),
  },
}));

describe('PasswordRecoveryService', () => {
  const configValues = new Map<string, string>();
  const resetTokens = {
    update: jest.fn(),
    create: jest.fn<(value: unknown) => unknown>(),
    save: jest.fn(),
  };
  const usersService = { findByEmail: jest.fn() };
  const passwordHasher = { hash: jest.fn() };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      return configValues.get(key) ?? fallback;
    }),
  };
  const dataSource = { transaction: jest.fn() };

  const service = new PasswordRecoveryService(
    resetTokens as never,
    usersService as never,
    passwordHasher as never,
    config as never,
    dataSource as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configValues.clear();
    passwordHasher.hash.mockResolvedValue('new-password-hash');
  });

  it('returns the same generic response when the email does not exist', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.requestReset('missing@example.com')).resolves.toEqual({
      success: true,
      message:
        'If an account exists for this email, you will receive password reset instructions.',
    });
    expect(resetTokens.save).not.toHaveBeenCalled();
  });

  it('stores only a hash for an active user reset token', async () => {
    let createdValue: unknown;
    usersService.findByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'worker@example.com',
      status: 'active',
    });
    resetTokens.update.mockResolvedValue({ affected: 0 });
    resetTokens.create.mockImplementation((value: unknown) => {
      createdValue = value;
      return value;
    });

    await service.requestReset('WORKER@example.com');

    if (typeof createdValue !== 'object' || createdValue === null) {
      throw new Error('A reset token was not created');
    }
    const created = createdValue as Record<string, unknown>;
    if (typeof created.tokenHash !== 'string') {
      throw new Error('The reset token hash was not created');
    }
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.userId).toBe('user-id');
    expect('token' in created).toBe(false);
  });

  it('sends the reset message through the official SendGrid SDK', async () => {
    configValues.set('SENDGRID_API_KEY', 'SG.test-key');
    configValues.set('SENDGRID_FROM_EMAIL', 'no-reply@example.com');
    configValues.set('SENDGRID_FROM_NAME', 'DR WorkOps');
    configValues.set(
      'PASSWORD_RESET_WEB_URL',
      'https://app.example.com/reset-password',
    );
    usersService.findByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'worker@example.com',
      status: 'active',
    });
    resetTokens.update.mockResolvedValue({ affected: 0 });
    resetTokens.create.mockImplementation((value: unknown) => value);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    jest.mocked(sgMail.send).mockResolvedValueOnce([{} as never, {}]);

    await service.requestReset('worker@example.com');

    // Jest replaces these SDK methods with functions that have no `this` binding.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sgMail.setApiKey).toHaveBeenCalledWith('SG.test-key');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sgMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'worker@example.com',
        from: {
          email: 'no-reply@example.com',
          name: 'DR WorkOps',
        },
        subject: 'Reset your DR WorkOps password',
      }),
    );
  });

  it('changes the password and consumes all outstanding tokens atomically', async () => {
    const storedToken = {
      id: 'token-id',
      userId: 'user-id',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const user = { id: 'user-id', status: 'active', passwordHash: 'old-hash' };
    const tokenRepository = {
      findOne: jest.fn().mockResolvedValue(storedToken),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
    };
    dataSource.transaction.mockImplementation(
      (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => Promise<unknown>,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === PasswordResetToken) return tokenRepository;
            if (entity === User) return userRepository;
            throw new Error('Unexpected repository');
          },
        }),
    );

    await expect(
      service.completeReset('a'.repeat(64), 'new-password'),
    ).resolves.toMatchObject({ success: true });
    expect(user.passwordHash).toBe('new-password-hash');
    expect(userRepository.save).toHaveBeenCalledWith(user);
    expect(tokenRepository.update).toHaveBeenCalled();
  });

  it('rejects an expired token without changing a user', async () => {
    const tokenRepository = {
      findOne: jest.fn().mockResolvedValue({
        userId: 'user-id',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    };
    const userRepository = { findOne: jest.fn() };
    dataSource.transaction.mockImplementation(
      (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => Promise<unknown>,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === PasswordResetToken) return tokenRepository;
            if (entity === User) return userRepository;
            throw new Error('Unexpected repository');
          },
        }),
    );

    await expect(
      service.completeReset('b'.repeat(64), 'new-password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});
