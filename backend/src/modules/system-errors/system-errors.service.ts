import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { SystemError } from '../../entities/system-error.entity';
import { errorContext, redact, safePath } from './error-context';

export type ErrorEvent = {
  source?: 'BE' | 'FE';
  level?: 'error' | 'warn';
  message: unknown;
  stack?: string;
  context?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  requestId?: string;
};

@Injectable()
export class SystemErrorsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private pending = 0;
  constructor(
    @InjectRepository(SystemError)
    private readonly errors: Repository<SystemError>,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
    void this.cleanup();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup() {
    try {
      await this.errors.delete({
        lastSeen: LessThan(new Date(Date.now() - 30 * 86400000)),
      });
    } catch {
      process.stderr.write('[SystemErrors] Retention cleanup unavailable\n');
    }
  }

  async record(event: ErrorEvent): Promise<void> {
    if (this.pending >= 100) return;
    this.pending++;
    try {
      const current = errorContext.getStore();
      const source = event.source || 'BE';
      const message = redact(event.message);
      const path = safePath(event.path ?? current?.request.originalUrl ?? '');
      const context = redact(event.context || '', 200);
      const stack = redact(event.stack || '');
      const method = redact(event.method ?? current?.request.method ?? '', 16);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            source,
            event.level || 'error',
            message
              .replace(
                /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
                ':id',
              )
              .replace(/\b\d{13}\b/g, ':time')
              .replace(/-[a-f0-9]{12}(?=\.)/gi, '-:id'),
            context,
            path,
            method,
            event.statusCode,
          ]),
        )
        .digest('hex');
      await this.errors.query(
        `INSERT INTO "system_errors"
        ("id","fingerprint","source","level","message","stack","context","path","method","statusCode","userId","requestId","firstSeen","lastSeen")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
        ON CONFLICT ("fingerprint") DO UPDATE SET
        "occurrences" = "system_errors"."occurrences" + 1, "lastSeen" = NOW(),
        "status" = 'pending', "resolvedAt" = NULL, "resolvedBy" = '',
        "userId" = EXCLUDED."userId", "requestId" = EXCLUDED."requestId"`,
        [
          randomUUID(),
          fingerprint,
          source,
          event.level || 'error',
          message,
          stack,
          context,
          path,
          method,
          event.statusCode ?? null,
          event.userId ?? current?.request.user?.id ?? '',
          event.requestId ?? current?.requestId ?? '',
        ],
      );
    } catch {
      // Use stderr directly so a database failure cannot recursively log itself.
      process.stderr.write(
        '[SystemErrors] Could not persist error; original console logging remains available\n',
      );
    } finally {
      this.pending--;
    }
  }

  async list(query: {
    source?: string;
    status?: string;
    level?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const pageSize = query.limit ?? 30;
    const qb = this.errors.createQueryBuilder('e');
    if (query.source)
      qb.andWhere('e.source = :source', { source: query.source });
    if (query.status)
      qb.andWhere('e.status = :status', { status: query.status });
    if (query.level) qb.andWhere('e.level = :level', { level: query.level });
    if (query.from) qb.andWhere('e.lastSeen >= :from', { from: query.from });
    if (query.to) qb.andWhere('e.lastSeen <= :to', { to: query.to });
    const [items, total] = await qb
      .orderBy('e.lastSeen', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, pageSize };
  }
  async setStatus(id: string, status: string, userId: string) {
    const result = await this.errors.update(id, {
      status,
      resolvedAt: status === 'resolved' ? new Date() : null,
      resolvedBy: status === 'resolved' ? userId : '',
    });
    return result.affected === 1;
  }
}
