import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Request } from 'express';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { UserAccessContext } from '../../access/ports/access.port';
import { GetUserAccessContextQuery } from '../../access/queries/get-user-access-context.query';
import { UsersService } from '../../users/services/users.service';
import { LoginCommand } from '../commands/login.command';
import { RegisterCommand } from '../commands/register.command';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PasswordHasherService } from '../services/password-hasher.service';

type AuthedRequest = Request & {
  user: UserAccessContext;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  register(@Body() dto: RegisterDto) {
    return this.commandBus.execute(
      new RegisterCommand(
        dto.email,
        dto.password,
        dto.firstName,
        dto.lastName,
        dto.phone,
      ),
    );
  }

  @Post('login')
  @ApiBody({ type: LoginDto })
  login(@Body() dto: LoginDto) {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password));
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthedRequest) {
    return this.queryBus.execute(new GetUserAccessContextQuery(req.user.id));
  }

  @Patch('me/profile')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @ApiBody({ type: UpdateProfileDto })
  async updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    await this.usersService.update(req.user.id, {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      avatarUrl: dto.avatarUrl,
    });

    return this.queryBus.execute(new GetUserAccessContextQuery(req.user.id));
  }

  @Post('me/change-password')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @Req() req: AuthedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    const valid = await this.passwordHasher.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!valid) {
      throw new BadRequestException('Current password is invalid');
    }

    await this.usersService.updatePassword(
      user.id,
      await this.passwordHasher.hash(dto.newPassword),
    );

    return { success: true };
  }
}
