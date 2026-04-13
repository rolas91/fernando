import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmModuleOptions } from './config/database.config';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { DrAuthModule } from './modules/dr-auth/dr-auth.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { OperationsModule } from './modules/operations/operations.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmModuleOptions,
    }),
    AccessModule,
    AuthModule,
    DrAuthModule,
    RealtimeModule,
    IntegrationsModule,
    OperationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
