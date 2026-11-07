import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { SystemErrorsService } from './system-errors.service';
import { ErrorRequest } from './error-context';

@Catch()
export class SystemErrorsFilter extends BaseExceptionFilter {
  constructor(
    adapter: HttpAdapterHost,
    private readonly errors: SystemErrorsService,
  ) {
    super(adapter.httpAdapter);
  }
  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<ErrorRequest>();
    // Unknown exceptions are logged by BaseExceptionFilter and captured by our logger.
    if (
      exception instanceof HttpException &&
      !req.path.startsWith('/api/system-errors/report')
    ) {
      void this.errors.record({
        message: exception.message,
        stack: exception.stack,
        context: 'HTTP',
        level: exception.getStatus() >= 500 ? 'error' : 'warn',
        statusCode: exception.getStatus(),
      });
    }
    super.catch(exception, host);
  }
}
