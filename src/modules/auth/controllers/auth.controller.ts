import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { LoginCommand } from '../commands/login.command';
import { RegisterCommand } from '../commands/register.command';
import { GetUserAccessContextQuery } from '../../access/queries/get-user-access-context.query';

type AuthedRequest = Request & {
  user: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password),
    );
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password));
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthedRequest) {
    return this.queryBus.execute(new GetUserAccessContextQuery(req.user.id));
  }
}
