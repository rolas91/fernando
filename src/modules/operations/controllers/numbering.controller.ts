import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { NumberingService } from '../services/numbering.service';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@UseGuards(OperationsAuthGuard)
@Controller('numbering')
export class NumberingController {
  constructor(private readonly numbering: NumberingService) {}

  @Get('work-orders/preview')
  async previewWorkOrder(@Req() _req: ReqWithOpsUser) {
    return this.numbering.previewNextWorkOrderNumber();
  }

  @Post('work-orders/reset')
  async resetWorkOrderSequence(
    @Body() body: { resetKey?: string; value?: number },
    @Req() _req: ReqWithOpsUser,
  ) {
    await this.numbering.resetSequence(body?.resetKey || 'GLOBAL', body?.value || 0);
    return { success: true };
  }
}
