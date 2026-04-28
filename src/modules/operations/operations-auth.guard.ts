import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserAccessContext } from '../access/ports/access.port';
import { OPERATIONS_RESOURCE_PERMISSIONS } from '../access/access-policy';
import { AccessService } from '../access/services/access.service';
import { AuthTokenService } from '../auth/services/auth-token.service';

type Action = 'read' | 'write';

@Injectable()
export class OperationsAuthGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      headers: Record<string, string | undefined>;
      user?: UserAccessContext;
    }>();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      if (this.isDevBypassEnabled()) return true;
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub: string };
    try {
      payload = this.authTokenService.verifyAccessToken(token);
    } catch {
      if (this.isDevBypassEnabled()) return true;
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.accessService.getUserAccessContext(payload.sub);
    const method = req.method.toUpperCase();
    const action: Action = ['GET', 'HEAD', 'OPTIONS'].includes(method)
      ? 'read'
      : 'write';
    const resource = this.extractResource(req.originalUrl || '');
    const permission = OPERATIONS_RESOURCE_PERMISSIONS[
      resource as keyof typeof OPERATIONS_RESOURCE_PERMISSIONS
    ]?.[action];

    if (permission && !user.permissions.includes(permission)) {
      throw new ForbiddenException(
        `User ${user.email} cannot ${action} ${resource}`,
      );
    }

    req.user = user;
    return true;
  }

  private extractResource(url: string): string {
    const normalized = (url || '').split('?')[0].replace(/^\/+/, '');
    const first = normalized.split('/')[0] || '';
    return first;
  }

  private isDevBypassEnabled(): boolean {
    const raw =
      process.env.AUTH_DEV_BYPASS ||
      ((process.env.NODE_ENV || 'development') !== 'production'
        ? 'true'
        : 'false');
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }
}
