import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { CreatePermissionCommand } from '../commands/create-permission.command';

@CommandHandler(CreatePermissionCommand)
export class CreatePermissionHandler implements ICommandHandler<CreatePermissionCommand> {
  constructor(private readonly accessService: AccessService) {}

  execute(command: CreatePermissionCommand) {
    return this.accessService.createPermission(
      command.key,
      command.description,
    );
  }
}
