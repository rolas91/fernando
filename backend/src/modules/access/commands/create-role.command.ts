export class CreateRoleCommand {
  constructor(
    public readonly key: string,
    public readonly name: string,
    public readonly description?: string,
  ) {}
}
