import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
