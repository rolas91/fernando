import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UsersPort } from '../../users/ports/users.port';
import { USERS_PORT } from '../../users/users.tokens';
import type { AccessPort } from '../../access/ports/access.port';
import { ACCESS_PORT } from '../../access/access.tokens';
import { ensureRuntimeEnv } from '../../../config/ensure-env';

export type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(USERS_PORT)
    private readonly users: UsersPort,
    @Inject(ACCESS_PORT)
    private readonly access: AccessPort,
  ) {
    ensureRuntimeEnv();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.access.getUserAccessContext(user.id);
  }
}
