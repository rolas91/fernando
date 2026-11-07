import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { Response, NextFunction } from 'express';
import { SystemError } from '../../entities/system-error.entity';
import { AuthModule } from '../auth/auth.module';
import { errorContext, ErrorRequest } from './error-context';
import {
  SystemErrorsController,
  SystemErrorsAdminGuard,
  OptionalErrorAuthGuard,
} from './system-errors.controller';
import { SystemErrorsService } from './system-errors.service';
import { SystemErrorsLogger } from './system-errors.logger';
import { SystemErrorsFilter } from './system-errors.filter';

@Module({
  imports: [TypeOrmModule.forFeature([SystemError]), AuthModule],
  controllers: [SystemErrorsController],
  providers: [
    SystemErrorsService,
    SystemErrorsLogger,
    SystemErrorsAdminGuard,
    OptionalErrorAuthGuard,
    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost, SystemErrorsService],
      useFactory: (adapter: HttpAdapterHost, errors: SystemErrorsService) =>
        new SystemErrorsFilter(adapter, errors),
    },
  ],
  exports: [SystemErrorsService, SystemErrorsLogger],
})
export class SystemErrorsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: ErrorRequest, res: Response, next: NextFunction) => {
        const requestId = randomUUID();
        res.setHeader('X-Request-Id', requestId);
        errorContext.run({ request: req, requestId }, next);
      })
      .forRoutes('*');
  }
}
