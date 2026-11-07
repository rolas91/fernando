import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { LoginCommand } from '../commands/login.command';
import { AuthService } from '../services/auth.service';

@CommandHandler(LoginCommand)
@Injectable()
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(private readonly authService: AuthService) {}

  async execute(command: LoginCommand) {
    return this.authService.login(command.email, command.password);
  }
}
