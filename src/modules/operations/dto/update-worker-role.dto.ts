import { PartialType } from '@nestjs/swagger';
import { CreateWorkerRoleDto } from './create-worker-role.dto';

export class UpdateWorkerRoleDto extends PartialType(CreateWorkerRoleDto) {}
