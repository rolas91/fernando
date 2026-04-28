import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../decorators/permissions.decorator';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AccessService } from '../services/access.service';
import { AssignRoleToUserCommand } from '../commands/assign-role-to-user.command';

@Controller('access/users')
@ApiTags('access')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserRolesController {
  constructor(
    private readonly accessService: AccessService,
    private readonly commandBus: CommandBus,
  ) {}

  @Post(':userId/roles')
  @Permissions('access.manage')
  @ApiBody({ type: AssignRoleDto })
  assignRole(@Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.commandBus.execute(
      new AssignRoleToUserCommand(userId, dto.roleKey),
    );
  }
}
