import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import sgMail from '@sendgrid/mail';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PasswordResetToken } from '../../../entities/password-reset-token.entity';
import { User } from '../../../entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { PasswordHasherService } from './password-hasher.service';

const REQUEST_RESPONSE =
  'If an account exists for this email, you will receive password reset instructions.';
const INVALID_LINK = 'This password reset link is invalid or has expired.';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async requestReset(email: string) {
    try {
      const user = await this.usersService.findByEmail(
        email.trim().toLowerCase(),
      );
      if (!user || user.status !== 'active') return this.requestResponse();

      const now = new Date();
      await this.resetTokens.update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(
        now.getTime() + this.expirationMinutes() * 60_000,
      );
      await this.resetTokens.save(
        this.resetTokens.create({
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt,
          usedAt: null,
        }),
      );

      await this.sendResetEmail(user.email, token);
    } catch (error) {
      this.logger.error(
        'Password reset request could not be processed.',
        error instanceof Error ? error.stack : undefined,
      );
    }

    return this.requestResponse();
  }

  async completeReset(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token.trim());
    const passwordHash = await this.passwordHasher.hash(newPassword);

    await this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(PasswordResetToken);
      const storedToken = await tokenRepository.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();

      if (
        !storedToken ||
        storedToken.usedAt ||
        storedToken.expiresAt.getTime() <= now.getTime()
      ) {
        throw new BadRequestException(INVALID_LINK);
      }

      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: storedToken.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status !== 'active') {
        throw new BadRequestException(INVALID_LINK);
      }

      user.passwordHash = passwordHash;
      await userRepository.save(user);
      await tokenRepository.update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: now },
      );
    });

    return {
      success: true,
      message: 'Your password has been reset successfully.',
    };
  }

  private requestResponse() {
    return { success: true, message: REQUEST_RESPONSE };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private expirationMinutes() {
    const configured = Number(
      this.config.get<string>('PASSWORD_RESET_EXPIRES_MINUTES', '30'),
    );
    return Number.isFinite(configured) && configured > 0
      ? Math.min(configured, 1440)
      : 30;
  }

  private resetWebUrl(token: string) {
    const configured = this.config
      .get<string>('PASSWORD_RESET_WEB_URL')
      ?.trim();
    const corsOrigin = this.config
      .get<string>('CORS_ORIGIN', 'http://localhost:8080')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    const base = configured || `${corsOrigin}/reset-password`;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}token=${encodeURIComponent(token)}`;
  }

  private async sendResetEmail(email: string, token: string) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY', '').trim();
    const fromEmail = this.config.get<string>('SENDGRID_FROM_EMAIL', '').trim();
    const fromName = this.config
      .get<string>('SENDGRID_FROM_NAME', 'DR WorkOps')
      .trim();
    if (
      !apiKey ||
      !fromEmail ||
      apiKey.includes('placeholder') ||
      fromEmail.includes('placeholder')
    ) {
      this.logger.warn(
        'Password reset email was not sent because SendGrid is not configured.',
      );
      return;
    }

    const webUrl = this.resetWebUrl(token);
    const mobileUrl = `mobile://reset-password?token=${encodeURIComponent(token)}`;
    sgMail.setApiKey(apiKey);

    await sgMail.send({
      from: { email: fromEmail, name: fromName || 'DR WorkOps' },
      to: email,
      subject: 'Reset your DR WorkOps password',
      text: [
        'We received a request to reset your DR WorkOps password.',
        `Reset it here: ${webUrl}`,
        `Open in the mobile app: ${mobileUrl}`,
        `This link expires in ${this.expirationMinutes()} minutes and can only be used once.`,
        'If you did not request this, you can ignore this email.',
      ].join('\n\n'),
      html: `
        <p>We received a request to reset your DR WorkOps password.</p>
        <p><a href="${webUrl}">Reset password on the web</a></p>
        <p><a href="${mobileUrl}">Open in the DR WorkOps app</a></p>
        <p>This link expires in ${this.expirationMinutes()} minutes and can only be used once.</p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
    });
  }
}
