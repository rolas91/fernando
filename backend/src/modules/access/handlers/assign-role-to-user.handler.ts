import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { AssignRoleToUserCommand } from '../commands/assign-role-to-user.command';

@CommandHandler(AssignRoleToUserCommand)
export class AssignRoleToUserHandler implements ICommandHandler<AssignRoleToUserCommand> {
  constructor(private readonly accessService: AccessService) {}

  execute(command: AssignRoleToUserCommand) {
    return this.accessService.assignRoleToUser(command.userId, command.roleKey);
  }
}
