export class AssignRoleToUserCommand {
  constructor(
    public readonly userId: string,
    public readonly roleKey: string,
  ) {}
}
