import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../decorators/permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { AccessService } from '../services/access.service';
import { CreatePermissionCommand } from '../commands/create-permission.command';
import { ListPermissionsQuery } from '../queries/list-permissions.query';

@Controller('access/permissions')
@ApiTags('access')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(
    private readonly accessService: AccessService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @Permissions('access.read')
  list() {
    return this.queryBus.execute(new ListPermissionsQuery());
  }

  @Post()
  @Permissions('access.manage')
  create(@Body() dto: CreatePermissionDto) {
    return this.commandBus.execute(
      new CreatePermissionCommand(dto.key, dto.description),
    );
  }
}
