import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { CreateRoleCommand } from '../commands/create-role.command';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand> {
  constructor(private readonly accessService: AccessService) {}

  execute(command: CreateRoleCommand) {
    return this.accessService.createRole(
      command.key,
      command.name,
      command.description,
    );
  }
}
