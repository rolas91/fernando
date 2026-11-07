import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../../entities/permission.entity';
import { Role } from '../../entities/role.entity';
import { User } from '../../entities/user.entity';
import { AssignRoleToUserHandler } from './handlers/assign-role-to-user.handler';
import { CreatePermissionHandler } from './handlers/create-permission.handler';
import { CreateRoleHandler } from './handlers/create-role.handler';
import { GetUserAccessContextHandler } from './handlers/get-user-access-context.handler';
import { GrantPermissionToRoleHandler } from './handlers/grant-permission-to-role.handler';
import { ListPermissionsHandler } from './handlers/list-permissions.handler';
import { ListRolesHandler } from './handlers/list-roles.handler';
import { PermissionsController } from './controllers/permissions.controller';
import { RolesController } from './controllers/roles.controller';
import { UserRolesController } from './controllers/user-roles.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { ACCESS_PORT } from './access.tokens';
import { AccessService } from './services/access.service';

const queryHandlers = [
  ListRolesHandler,
  ListPermissionsHandler,
  GetUserAccessContextHandler,
];

const commandHandlers = [
  CreateRoleHandler,
  CreatePermissionHandler,
  GrantPermissionToRoleHandler,
  AssignRoleToUserHandler,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission]),
    PassportModule,
    CqrsModule,
  ],
  controllers: [RolesController, PermissionsController, UserRolesController],
  providers: [
    AccessService,
    {
      provide: ACCESS_PORT,
      useExisting: AccessService,
    },
    PermissionsGuard,
    ...queryHandlers,
    ...commandHandlers,
  ],
  exports: [AccessService, ACCESS_PORT],
})
export class AccessModule {}
