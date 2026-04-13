import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AccessService } from '../services/access.service';
import { GetUserAccessContextQuery } from '../queries/get-user-access-context.query';

@QueryHandler(GetUserAccessContextQuery)
export class GetUserAccessContextHandler implements IQueryHandler<GetUserAccessContextQuery> {
  constructor(private readonly accessService: AccessService) {}

  execute(query: GetUserAccessContextQuery) {
    return this.accessService.getUserAccessContext(query.userId);
  }
}
