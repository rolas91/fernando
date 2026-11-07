import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { DrAuthService } from './dr-auth.service';

type DrAuthActionBody = {
  action: string;
  email?: string;
  password?: string;
  token?: string;
  userId?: string;
  currentPassword?: string;
  newPassword?: string;
  firstName?: string;
  lastName?: string;
  role?: 'admin' | 'manager' | 'scheduler' | 'viewer';
  phone?: string;
  status?: 'active' | 'inactive' | 'archived';
};

@Controller('dr-auth')
export class DrAuthController {
  constructor(private readonly service: DrAuthService) {}

  @Post('action')
  async action(
    @Body() body: DrAuthActionBody,
    @Req()
    req: { headers: Record<string, string | undefined> },
  ) {
    const action = body?.action;

    const actor = this.getActor(req.headers.authorization);

    if (
      [
        'list_users',
        'create_user',
        'update_user',
        'delete_user',
        'reset_password',
      ].includes(action)
    ) {
      if (!actor && !this.isDevBypassEnabled()) {
        throw new UnauthorizedException('Missing bearer token');
      }
      if (actor && actor.role !== 'admin') {
        throw new ForbiddenException('Only admin can manage users');
      }
    }

    if (action === 'update_profile' || action === 'change_password') {
      if (!actor && !this.isDevBypassEnabled()) {
        throw new UnauthorizedException('Missing bearer token');
      }
      if (
        actor &&
        actor.role !== 'admin' &&
        body.userId &&
        body.userId !== actor.userId
      ) {
        throw new ForbiddenException('Cannot update another user profile');
      }
    }

    switch (action) {
      case 'login':
        return this.service.login(body.email || '', body.password || '');
      case 'verify':
        return this.service.verify(body.token || '');
      case 'register':
        return this.service.register({
          email: body.email || '',
          password: body.password || '',
          firstName: body.firstName || '',
          lastName: body.lastName || '',
          role: body.role,
          phone: body.phone,
        });
      case 'list_users':
        return this.service.listUsers();
      case 'create_user':
        return this.service.createUser({
          firstName: body.firstName || '',
          lastName: body.lastName || '',
          email: body.email || '',
          phone: body.phone,
          role: body.role || 'viewer',
          password: body.password || '',
        });
      case 'update_user':
        return this.service.updateUser(body.userId || '', body);
      case 'delete_user':
        return this.service.deleteUser(body.userId || '');
      case 'reset_password':
        return this.service.resetPassword(
          body.userId || '',
          body.newPassword || '',
        );
      case 'change_password':
        return this.service.changePassword(
          body.userId || '',
          body.currentPassword || '',
          body.newPassword || '',
        );
      case 'update_profile':
        return this.service.updateProfile(body.userId || '', body);
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  private getActor(authHeader?: string) {
    const raw = authHeader || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
    if (!token) return null;
    return this.service.verifyAccessToken(token);
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
