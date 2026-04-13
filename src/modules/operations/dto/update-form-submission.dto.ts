import { PartialType } from '@nestjs/swagger';
import { CreateFormSubmissionDto } from './create-form-submission.dto';

export class UpdateFormSubmissionDto extends PartialType(
  CreateFormSubmissionDto,
) {}
