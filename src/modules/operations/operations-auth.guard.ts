import {
  CanActivate,
  ForbiddenException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DrAuthService } from '../dr-auth/dr-auth.service';

type Role = 'admin' | 'manager' | 'scheduler' | 'viewer';
type Action = 'read' | 'write';

const WRITE_RULES: Record<string, Role[]> = {
  workers: ['admin', 'manager'],
  equipment: ['admin', 'manager'],
  clients: ['admin', 'manager'],
  projects: ['admin', 'manager'],
  'form-templates': ['admin', 'manager'],
  'company-settings': ['admin', 'manager'],
  'work-orders': ['admin', 'manager', 'scheduler'],
  timesheets: ['admin', 'manager', 'scheduler'],
  notifications: ['admin', 'manager', 'scheduler'],
  'activity-feed': ['admin', 'manager', 'scheduler'],
  'form-submissions': ['admin', 'manager', 'scheduler'],
  incidents: ['admin', 'manager', 'scheduler'],
  'availability-requests': ['admin', 'manager', 'scheduler'],
};

@Injectable()
export class OperationsAuthGuard implements CanActivate {
  constructor(private readonly authService: DrAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      headers: Record<string, string | undefined>;
      user?: { id: string; role: Role };
    }>();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!token) {
      if (this.isDevBypassEnabled()) return true;
      throw new UnauthorizedException('Missing bearer token');
    }

    const verified = this.authService.verifyAccessToken(token);
    if (!verified) {
      if (this.isDevBypassEnabled()) return true;
      throw new UnauthorizedException('Invalid token');
    }

    const method = req.method.toUpperCase();
    const action: Action = ['GET', 'HEAD', 'OPTIONS'].includes(method)
      ? 'read'
      : 'write';
    const resource = this.extractResource(req.originalUrl || '');

    if (action === 'write') {
      const allowedRoles = WRITE_RULES[resource] || ['admin', 'manager'];
      if (!allowedRoles.includes(verified.role)) {
        throw new ForbiddenException(
          `Role ${verified.role} cannot write ${resource}`,
        );
      }
    }

    req.user = { id: verified.userId, role: verified.role };
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
