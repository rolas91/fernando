import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { RegisterCommand } from '../commands/register.command';
import { AuthService } from '../services/auth.service';

@CommandHandler(RegisterCommand)
@Injectable()
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(private readonly authService: AuthService) {}

  async execute(command: RegisterCommand) {
    return this.authService.register({
      email: command.email,
      password: command.password,
      firstName: command.firstName,
      lastName: command.lastName,
      phone: command.phone,
    });
  }
}
