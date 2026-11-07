import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { SignOptions } from 'jsonwebtoken';
import { UserProfile } from '../../entities/user-profile.entity';
import { DrAuthController } from './dr-auth.controller';
import { DrAuthService } from './dr-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '7d',
          ) as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [DrAuthController],
  providers: [DrAuthService],
  exports: [DrAuthService],
})
export class DrAuthModule {}
