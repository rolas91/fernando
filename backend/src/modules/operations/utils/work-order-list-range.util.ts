import { BadRequestException } from '@nestjs/common';

export interface WorkOrderListRange {
  from?: unknown;
  to?: unknown;
}

export function normalizeWorkOrderListRange(input?: WorkOrderListRange): { from: string; to: string } | undefined {
  if (input?.from === undefined && input?.to === undefined) return undefined;
  const valid = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!valid(input?.from) || !valid(input?.to) || input.from > input.to) {
    throw new BadRequestException('Provide a valid from/to date range in YYYY-MM-DD format.');
  }
  return { from: input.from, to: input.to };
}
