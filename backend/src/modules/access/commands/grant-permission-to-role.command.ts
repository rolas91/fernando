export class GrantPermissionToRoleCommand {
  constructor(
    public readonly roleKey: string,
    public readonly permissionKey: string,
  ) {}
}
