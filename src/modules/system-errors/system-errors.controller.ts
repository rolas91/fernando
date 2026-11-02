import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { ErrorRequest } from './error-context';
import { SystemErrorsService } from './system-errors.service';

@Injectable()
export class SystemErrorsAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (
      context.switchToHttp().getRequest<ErrorRequest>().user?.role !== 'admin'
    ) {
      throw new ForbiddenException(
        'Only administrators can manage system errors',
      );
    }
    return true;
  }
}

@Injectable()
export class OptionalErrorAuthGuard extends JwtAuthGuard {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    return user || (null as TUser);
  }
}

class FrontendErrorDto {
  @IsString() @MaxLength(8000) message: string;
  @IsOptional() @IsString() @MaxLength(8000) stack?: string;
  @IsOptional() @IsString() @MaxLength(200) context?: string;
  @IsOptional() @IsString() @MaxLength(1000) path?: string;
  @IsOptional() @IsString() @MaxLength(16) method?: string;
  @IsOptional() @IsInt() @Min(400) @Max(599) statusCode?: number;
  @IsOptional() @IsIn(['error', 'warn']) level?: 'error' | 'warn';
  @IsOptional() @IsUUID() requestId?: string;
}
class ErrorQueryDto {
  @IsOptional() @IsIn(['BE', 'FE']) source?: string;
  @IsOptional() @IsIn(['pending', 'resolved']) status?: string;
  @IsOptional() @IsIn(['error', 'warn']) level?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
}
class ErrorStatusDto {
  @IsIn(['pending', 'resolved']) status: 'pending' | 'resolved';
}

@Controller('system-errors')
export class SystemErrorsController {
  private readonly clients = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(private readonly errors: SystemErrorsService) {}

  @Post('report')
  @HttpCode(202)
  @UseGuards(OptionalErrorAuthGuard)
  async report(@Body() dto: FrontendErrorDto, @Req() req: ErrorRequest) {
    const now = Date.now();
    for (const [key, entry] of this.clients)
      if (entry.until <= now) this.clients.delete(key);
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = this.clients.get(key);
    if (!entry) {
      if (this.clients.size >= 5000)
        throw new HttpException('Reporting capacity reached', 429);
      entry = { count: 0, until: now + 60000 };
      this.clients.set(key, entry);
    }
    if (++entry.count > 30)
      throw new HttpException('Too many error reports', 429);
    await this.errors.record({
      ...dto,
      source: 'FE',
      userId: req.user?.id || '',
    });
    return { accepted: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard, SystemErrorsAdminGuard)
  list(@Query() query: ErrorQueryDto) {
    return this.errors.list(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, SystemErrorsAdminGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ErrorStatusDto,
    @Req() req: ErrorRequest,
  ) {
    if (!(await this.errors.setStatus(id, dto.status, req.user!.id)))
      throw new NotFoundException();
    return { success: true };
  }
}
