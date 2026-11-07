import { PartialType } from '@nestjs/swagger';
import { CreateActivityFeedItemDto } from './create-activity-feed-item.dto';

export class UpdateActivityFeedItemDto extends PartialType(
  CreateActivityFeedItemDto,
) {}
