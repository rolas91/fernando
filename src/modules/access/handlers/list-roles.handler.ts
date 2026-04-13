import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { ListRolesQuery } from '../queries/list-roles.query';

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery> {
  constructor(private readonly accessService: AccessService) {}

  execute() {
    return this.accessService.listRoles();
  }
}
