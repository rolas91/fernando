import { ConsoleLogger, Injectable } from '@nestjs/common';
import { SystemErrorsService } from './system-errors.service';

@Injectable()
export class SystemErrorsLogger extends ConsoleLogger {
  constructor(private readonly errors: SystemErrorsService) {
    super();
  }
  error(message: any, ...optional: any[]) {
    super.error(message, ...optional);
    this.capture('error', message, optional);
  }
  warn(message: any, ...optional: any[]) {
    super.warn(message, ...optional);
    this.capture('warn', message, optional);
  }
  fatal(message: any, ...optional: any[]) {
    super.fatal(message, ...optional);
    this.capture('error', message, optional);
  }
  private capture(
    level: 'warn' | 'error',
    message: unknown,
    optional: unknown[],
  ) {
    const context =
      typeof optional.at(-1) === 'string' ? String(optional.at(-1)) : '';
    const stack =
      message instanceof Error
        ? message.stack
        : optional.length > 1
          ? String(optional[0])
          : '';
    void this.errors.record({ level, message, context, stack });
  }
}
