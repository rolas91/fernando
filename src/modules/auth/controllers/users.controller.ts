import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../access/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access/guards/permissions.guard';
import { AccessService } from '../../access/services/access.service';
import { UsersService } from '../../users/services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PasswordHasherService } from '../services/password-hasher.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly accessService: AccessService,
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  @Get()
  @Permissions('users.read')
  listUsers() {
    return this.accessService.listUserAccessContexts();
  }

  @Post()
  @Permissions('users.write')
  @ApiBody({ type: CreateUserDto })
  async createUser(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash: await this.passwordHasher.hash(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      status: 'active',
      lastLogin: null,
    });

    return this.accessService.replaceAppRoleForUser(user.id, dto.role);
  }

  @Patch(':userId')
  @Permissions('users.write')
  @ApiBody({ type: UpdateUserDto })
  async updateUser(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    await this.usersService.update(userId, {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      status: dto.status,
    });

    if (dto.role) {
      return this.accessService.replaceAppRoleForUser(userId, dto.role);
    }

    return this.accessService.getUserAccessContext(userId);
  }

  @Post(':userId/reset-password')
  @Permissions('users.write')
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.usersService.updatePassword(
      userId,
      await this.passwordHasher.hash(dto.newPassword),
    );

    return { success: true };
  }

  @Delete(':userId')
  @Permissions('users.write')
  async deleteUser(@Param('userId') userId: string) {
    await this.usersService.delete(userId);
    return { success: true };
  }
}
