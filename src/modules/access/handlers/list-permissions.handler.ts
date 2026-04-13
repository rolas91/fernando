import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { ListPermissionsQuery } from '../queries/list-permissions.query';

@QueryHandler(ListPermissionsQuery)
export class ListPermissionsHandler implements IQueryHandler<ListPermissionsQuery> {
  constructor(private readonly accessService: AccessService) {}

  execute() {
    return this.accessService.listPermissions();
  }
}
