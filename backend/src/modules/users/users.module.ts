import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UsersService } from './services/users.service';
import { USERS_PORT } from './users.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    UsersService,
    {
      provide: USERS_PORT,
      useExisting: UsersService,
    },
  ],
  exports: [UsersService, USERS_PORT],
})
export class UsersModule {}
