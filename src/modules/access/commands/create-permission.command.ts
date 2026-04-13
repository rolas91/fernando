export class CreatePermissionCommand {
  constructor(
    public readonly key: string,
    public readonly description?: string,
  ) {}
}
