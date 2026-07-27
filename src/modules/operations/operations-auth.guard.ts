import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormTemplate } from '../../entities/form-template.entity';
import type { UserAccessContext } from '../access/ports/access.port';
import { OPERATIONS_RESOURCE_PERMISSIONS } from '../access/access-policy';
import { AccessService } from '../access/services/access.service';
import { AuthTokenService } from '../auth/services/auth-token.service';
import { ShiftWorkOrderAccessService } from './services/shift-work-order-access.service';

type Action = 'read' | 'write';

@Injectable()
export class OperationsAuthGuard implements CanActivate {
  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly accessService: AccessService,
    @Optional()
    @InjectRepository(FormTemplate)
    private readonly formTemplatesRepo?: Repository<FormTemplate>,
    @Optional()
    private readonly shiftWorkOrderAccess?: ShiftWorkOrderAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      headers: Record<string, string | undefined>;
      body?: Record<string, unknown>;
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
    const url = req.originalUrl || '';
    const resource = this.extractResource(url);
    const permission =
      (await this.permissionForRequest(url, method, action)) ||
      OPERATIONS_RESOURCE_PERMISSIONS[
        resource as keyof typeof OPERATIONS_RESOURCE_PERMISSIONS
      ]?.[action];

    if (permission && !user.permissions.includes(permission)) {
      if (
        permission === OPERATIONS_RESOURCE_PERMISSIONS['form-submissions'].write &&
        (await this.canWriteFormSubmissionWithMobilePermission(user, req))
      ) {
        req.user = user;
        return true;
      }

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

  private async permissionForRequest(
    url: string,
    method: string,
    action: Action,
  ): Promise<string | undefined> {
    const normalized = (url || '').split('?')[0].replace(/^\/+/, '');

    if (normalized === 'work-orders/mobile/assignments' && action === 'read') {
      return 'mobile.assignments.read';
    }

    if (
      normalized.startsWith('work-orders/mobile/assignments/') &&
      normalized.endsWith('/confirmation') &&
      method === 'PATCH'
    ) {
      return 'mobile.shifts.confirm';
    }

    if (
      (normalized === 'form-submissions' && ['POST', 'PATCH'].includes(method)) ||
      (normalized.startsWith('form-submissions/') && method === 'PATCH')
    ) {
      return OPERATIONS_RESOURCE_PERMISSIONS['form-submissions'].write;
    }

    return undefined;
  }

  private async canWriteFormSubmissionWithMobilePermission(
    user: UserAccessContext,
    req: { body?: Record<string, unknown> },
  ): Promise<boolean> {
    const templateId =
      typeof req.body?.templateId === 'string' ? req.body.templateId.trim() : '';
    if (!templateId || !this.formTemplatesRepo) return false;

    const template = await this.formTemplatesRepo.findOne({
      where: { id: templateId },
    });
    const category = (template?.category || '')
      .toLowerCase()
      .replace(/[_\s-]+/g, ' ');

    if (category.includes('timesheet')) {
      return user.permissions.includes('mobile.timesheets.submit');
    }

    if (category.includes('incident')) {
      return user.permissions.includes('mobile.incidents.submit');
    }

    if (category.includes('work order') || category.includes('workorder')) {
      return (
        user.permissions.includes('mobile.work-orders.submit') ||
        Boolean(
          await this.shiftWorkOrderAccess?.canManageShiftWorkOrder(
            user,
            typeof req.body?.workOrderId === 'string'
              ? req.body.workOrderId
              : undefined,
            typeof req.body?.shiftId === 'string' ? req.body.shiftId : undefined,
          ),
        )
      );
    }

    return false;
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
