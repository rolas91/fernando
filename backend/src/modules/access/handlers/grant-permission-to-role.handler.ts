import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { GrantPermissionToRoleCommand } from '../commands/grant-permission-to-role.command';

@CommandHandler(GrantPermissionToRoleCommand)
export class GrantPermissionToRoleHandler implements ICommandHandler<GrantPermissionToRoleCommand> {
  constructor(private readonly accessService: AccessService) {}

  execute(command: GrantPermissionToRoleCommand) {
    return this.accessService.grantPermissionToRole(
      command.roleKey,
      command.permissionKey,
    );
  }
}
