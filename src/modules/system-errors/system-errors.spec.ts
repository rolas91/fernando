import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SystemErrorsModule } from './system-errors.module';
import request from 'supertest';
import { Repository } from 'typeorm';
import { SystemError } from '../../entities/system-error.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { errorContext, ErrorRequest, redact, safePath } from './error-context';
import {
  OptionalErrorAuthGuard,
  SystemErrorsAdminGuard,
  SystemErrorsController,
} from './system-errors.controller';
import { SystemErrorsService } from './system-errors.service';

describe('system errors access and reporting', () => {
  let app: any;
  const service = {
    record: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    setStatus: jest.fn().mockResolvedValue(true),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SystemErrorsController],
      providers: [
        SystemErrorsAdminGuard,
        { provide: SystemErrorsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          req.user = { id: 'authenticated-user', role };
          return true;
        },
      })
      .overrideGuard(OptionalErrorAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated readers', async () => {
    await request(app.getHttpServer()).get('/system-errors').expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'scheduler', 'manager'])(
    'blocks %s from reading and managing errors',
    async (role) => {
      await request(app.getHttpServer())
        .get('/system-errors')
        .set('x-test-role', role)
        .expect(403);
      await request(app.getHttpServer())
        .patch('/system-errors/063a0934-6654-4f9c-9643-81fdc257a927')
        .set('x-test-role', role)
        .send({ status: 'resolved' })
        .expect(403);
      expect(service.list).not.toHaveBeenCalled();
      expect(service.setStatus).not.toHaveBeenCalled();
    },
  );
  it('allows admins to list and resolve errors with server-supplied identity', async () => {
    await request(app.getHttpServer())
      .get('/system-errors?source=FE&page=2')
      .set('x-test-role', 'admin')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'FE', page: 2 }),
    );
    await request(app.getHttpServer())
      .patch('/system-errors/063a0934-6654-4f9c-9643-81fdc257a927')
      .set('x-test-role', 'admin')
      .send({ status: 'resolved' })
      .expect(200);
    expect(service.setStatus).toHaveBeenCalledWith(
      expect.any(String),
      'resolved',
      'authenticated-user',
    );
  });
  it('accepts anonymous frontend reports but refuses forged user/source fields', async () => {
    await request(app.getHttpServer())
      .post('/system-errors/report')
      .send({ message: 'Render failed', context: 'React' })
      .expect(202);
    expect(service.record).toHaveBeenCalledWith({
      message: 'Render failed',
      context: 'React',
      source: 'FE',
      userId: '',
    });
    await request(app.getHttpServer())
      .post('/system-errors/report')
      .send({ message: 'Forged', source: 'BE', userId: 'admin' })
      .expect(400);
  });
  it('validates filters, lengths, UUIDs and administrative status', async () => {
    await request(app.getHttpServer())
      .get('/system-errors?page=-1')
      .set('x-test-role', 'admin')
      .expect(400);
    await request(app.getHttpServer())
      .patch('/system-errors/not-a-uuid')
      .set('x-test-role', 'admin')
      .send({ status: 'resolved' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/system-errors/report')
      .send({ message: 'x'.repeat(8001) })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/system-errors/063a0934-6654-4f9c-9643-81fdc257a927')
      .set('x-test-role', 'admin')
      .send({ status: 'deleted' })
      .expect(400);
  });
  it('limits public ingestion', async () => {
    let limited = false;
    for (let i = 0; i < 32; i++) {
      const response = await request(app.getHttpServer())
        .post('/system-errors/report')
        .send({ message: 'Rate test' });
      if (response.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});

@Module({})
class TestAuthModule {}

describe('system error module wiring', () => {
  it('starts with its real middleware and attributes ingestion to the request', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const module = await Test.createTestingModule({ imports: [SystemErrorsModule] })
      .overrideModule(AuthModule).useModule(TestAuthModule)
      .overrideProvider(getRepositoryToken(SystemError)).useValue({ query, delete: jest.fn().mockResolvedValue({ affected: 0 }) })
      .overrideGuard(OptionalErrorAuthGuard).useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    try {
      await app.init();
      const response = await request(app.getHttpServer()).post('/system-errors/report').send({ message: 'Module wiring test' }).expect(202);
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
      expect(query.mock.calls[0][1]).toContain(response.headers['x-request-id']);
      expect(query.mock.calls[0][1]).toContain('FE');
    } finally { await app.close(); }
  });
});

describe('system error persistence safety', () => {
  it('removes credentials, email and query parameters', () => {
    const value = redact(
      'Authorization: Bearer abc123 password="secret" {"token":"hidden"} user@example.com',
    );
    expect(value).not.toMatch(/abc123|secret|hidden|user@example.com/);
    expect(safePath('/reset?token=private#fragment')).toBe('/reset');
  });
  it('takes the user and request ID from the current request and sanitizes stored data', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new SystemErrorsService({
      query,
    } as unknown as Repository<SystemError>);
    await errorContext.run(
      {
        requestId: 'request-123',
        request: {
          originalUrl: '/api/example?token=secret',
          method: 'POST',
          user: { id: 'user-1', role: 'viewer' },
        } as ErrorRequest,
      },
      () => service.record({ message: 'password=private', context: 'Example' }),
    );
    const values = query.mock.calls[0][1];
    expect(values).toContain('/api/example');
    expect(values).toContain('user-1');
    expect(values).toContain('request-123');
    expect(JSON.stringify(values)).not.toMatch(/secret|private/);
  });
  it('groups repeated generated filenames despite their random suffixes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new SystemErrorsService({
      query,
    } as unknown as Repository<SystemError>);
    await service.record({ message: 'Upload failed: Report-99aa56091ae5.pdf' });
    await service.record({ message: 'Upload failed: Report-416f1bafb3a0.pdf' });
    expect(query.mock.calls[0][1][1]).toBe(query.mock.calls[1][1][1]);
  });
  it('does not propagate storage failures or recursively call the logger', async () => {
    const query = jest.fn().mockRejectedValue(new Error('DB unavailable'));
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const service = new SystemErrorsService({
        query,
      } as unknown as Repository<SystemError>);
      await expect(
        service.record({ message: 'Original failure' }),
      ).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1);
      expect(stderr).toHaveBeenCalledTimes(1);
    } finally {
      stderr.mockRestore();
    }
  });
});
