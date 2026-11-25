import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UsersPort } from '../../users/ports/users.port';
import { USERS_PORT } from '../../users/users.tokens';
import type { AccessPort } from '../../access/ports/access.port';
import { ACCESS_PORT } from '../../access/access.tokens';
import { Request } from 'express';
import { assertWebAccess } from '../web-access';
import { ensureRuntimeEnv } from '../../../config/ensure-env';

export type JwtPayload = {
  sub: string;
  email: string;
  platform?: 'web' | 'mobile';
};

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
      passReqToCallback: true,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException();
    }
    const context = await this.access.getUserAccessContext(user.id);
    if (
      payload.platform === 'web' ||
      req.headers['x-client-platform'] === 'web'
    )
      assertWebAccess(context);
    return context;
  }
}
