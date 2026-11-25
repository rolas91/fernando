import { ForbiddenException } from '@nestjs/common';
export const WEB_ACCESS_DENIED =
  'Web panel access is disabled for your account. You can still use the mobile app.';
type WebAccessUser = {
  role?: string;
  roles?: string[];
  webAccessEnabled?: boolean;
};
export function assertWebAccess(user: WebAccessUser): void {
  if (
    user.role !== 'admin' &&
    !user.roles?.includes('admin') &&
    user.webAccessEnabled !== true
  ) {
    throw new ForbiddenException(WEB_ACCESS_DENIED);
  }
}
