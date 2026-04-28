import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../decorators/permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { CreateRoleDto } from '../dto/create-role.dto';
import { GrantPermissionDto } from '../dto/grant-permission.dto';
import { AccessService } from '../services/access.service';
import { CreateRoleCommand } from '../commands/create-role.command';
import { GrantPermissionToRoleCommand } from '../commands/grant-permission-to-role.command';
import { ListRolesQuery } from '../queries/list-roles.query';

@Controller('access/roles')
@ApiTags('access')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly accessService: AccessService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @Permissions('access.read')
  list() {
    return this.queryBus.execute(new ListRolesQuery());
  }

  @Post()
  @Permissions('access.manage')
  @ApiBody({ type: CreateRoleDto })
  create(@Body() dto: CreateRoleDto) {
    return this.commandBus.execute(
      new CreateRoleCommand(dto.key, dto.name, dto.description),
    );
  }

  @Post(':roleKey/permissions')
  @Permissions('access.manage')
  @ApiBody({ type: GrantPermissionDto })
  grantPermission(
    @Param('roleKey') roleKey: string,
    @Body() dto: GrantPermissionDto,
  ) {
    return this.commandBus.execute(
      new GrantPermissionToRoleCommand(roleKey, dto.permissionKey),
    );
  }
}
