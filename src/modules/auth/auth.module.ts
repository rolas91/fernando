import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { AccessModule } from '../access/access.module';
import { UsersModule } from '../users/users.module';
import { ensureRuntimeEnv } from '../../config/ensure-env';
import { AuthController } from './controllers/auth.controller';
import { LoginHandler } from './handlers/login.handler';
import { RegisterHandler } from './handlers/register.handler';
import { AuthTokenService } from './services/auth-token.service';
import { AuthService } from './services/auth.service';
import { PasswordHasherService } from './services/password-hasher.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const commandHandlers = [RegisterHandler, LoginHandler];

@Module({
  imports: [
    AccessModule,
    CqrsModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (ensureRuntimeEnv(), config.getOrThrow<string>('JWT_SECRET')),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '7d',
          ) as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    ...commandHandlers,
    AuthService,
    AuthTokenService,
    PasswordHasherService,
    JwtStrategy,
  ],
})
export class AuthModule {}
