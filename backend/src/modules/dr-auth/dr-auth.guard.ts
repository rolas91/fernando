import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DrAuthService } from './dr-auth.service';

@Injectable()
export class DrAuthGuard implements CanActivate {
  constructor(private readonly authService: DrAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string };
    }>();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const result = this.authService.verifyAccessToken(token);
    if (!result) throw new UnauthorizedException('Invalid token');

    req.user = { id: result.userId };
    return true;
  }
}
