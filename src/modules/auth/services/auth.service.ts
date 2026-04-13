import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccessPort,
  UserAccessContext,
} from '../../access/ports/access.port';
import { ACCESS_PORT } from '../../access/access.tokens';
import type { UsersPort } from '../../users/ports/users.port';
import { USERS_PORT } from '../../users/users.tokens';
import type { JwtPayload } from '../strategies/jwt.strategy';
import { AuthTokenService } from './auth-token.service';
import { PasswordHasherService } from './password-hasher.service';

export type AuthResponse = {
  access_token: string;
  user: UserAccessContext;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(USERS_PORT)
    private readonly users: UsersPort,
    @Inject(ACCESS_PORT)
    private readonly access: AccessPort,
    private readonly configService: ConfigService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async register(email: string, password: string): Promise<AuthResponse> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const user = await this.users.create(email, passwordHash);

    const defaultRoleKey = this.configService.get<string>(
      'DEFAULT_ROLE_KEY',
      'user',
    );
    await this.access.ensureRoleExists(defaultRoleKey, 'User');
    await this.access.assignRoleToUser(user.id, defaultRoleKey);

    return this.buildAuthResponse(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const ok = await this.passwordHasher.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildAuthResponse(user.id, user.email);
  }

  private async buildAuthResponse(
    userId: string,
    email: string,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: userId, email };

    return {
      access_token: this.tokenService.signAccessToken(payload),
      user: await this.access.getUserAccessContext(userId),
    };
  }
}
