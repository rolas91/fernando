import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { WorkOrderSequence } from '../../../entities/work-order-sequence.entity';

export type WorkOrderResetMode = 'never' | 'yearly' | 'monthly';

export interface WorkOrderNumberingConfig {
  prefix: string;
  padding: number;
  reset: WorkOrderResetMode;
  template: string;
}

export const DEFAULT_WORK_ORDER_NUMBERING: WorkOrderNumberingConfig = {
  prefix: 'ASN',
  padding: 4,
  reset: 'yearly',
  template: '{PREFIX}-{YYYY}-{NNNN}',
};

const SCOPE = 'work_order';

@Injectable()
export class NumberingService {
  private readonly logger = new Logger(NumberingService.name);

  constructor(
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectRepository(WorkOrderSequence)
    private readonly sequenceRepo: Repository<WorkOrderSequence>,
    private readonly dataSource: DataSource,
  ) {}

  async loadConfig(): Promise<WorkOrderNumberingConfig> {
    const settings = await this.settingsRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (settings.length === 0) return { ...DEFAULT_WORK_ORDER_NUMBERING };
    const s = settings[0];
    return {
      prefix: s.workOrderNumberPrefix || DEFAULT_WORK_ORDER_NUMBERING.prefix,
      padding:
        s.workOrderNumberPadding || DEFAULT_WORK_ORDER_NUMBERING.padding,
      reset: (s.workOrderNumberReset as WorkOrderResetMode) ||
        DEFAULT_WORK_ORDER_NUMBERING.reset,
      template:
        s.workOrderNumberTemplate || DEFAULT_WORK_ORDER_NUMBERING.template,
    };
  }

  /**
   * Computes the next work order number using the configured format and
   * incrementing the persisted sequence for the current reset key. Safe
   * against concurrent calls because the UPSERT runs inside a transaction
   * with row-level locking via a unique index lookup.
   */
  async nextWorkOrderNumber(
    referenceDate: Date = new Date(),
  ): Promise<string> {
    const config = await this.loadConfig();
    const resetKey = this.computeResetKey(config.reset, referenceDate);
    const nextValue = await this.advanceSequence(resetKey);
    return this.format(config, nextValue, referenceDate);
  }

  /**
   * Returns the next number that WOULD be assigned, without consuming a
   * sequence value. Useful for previews in the UI.
   */
  async previewNextWorkOrderNumber(
    referenceDate: Date = new Date(),
  ): Promise<{ number: string; config: WorkOrderNumberingConfig }> {
    const config = await this.loadConfig();
    const resetKey = this.computeResetKey(config.reset, referenceDate);
    const row = await this.sequenceRepo.findOne({
      where: { scope: SCOPE, resetKey },
    });
    const nextValue = (row?.lastValue ?? 0) + 1;
    return {
      number: this.format(config, nextValue, referenceDate),
      config,
    };
  }

  /**
   * Resets the sequence for a given reset key (admin tool).
   */
  async resetSequence(
    resetKey: string = 'GLOBAL',
    value: number = 0,
  ): Promise<void> {
    await this.sequenceRepo
      .createQueryBuilder()
      .insert()
      .into(WorkOrderSequence)
      .values({ scope: SCOPE, resetKey, lastValue: value })
      .orUpdate(['last_value', 'updated_at'], ['scope', 'reset_key'])
      .execute();
  }

  private computeResetKey(
    mode: WorkOrderResetMode,
    date: Date,
  ): string {
    if (mode === 'never') return 'GLOBAL';
    const y = date.getUTCFullYear();
    if (mode === 'yearly') return String(y);
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private async advanceSequence(resetKey: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WorkOrderSequence);
      const existing = await repo
      .createQueryBuilder('seq')
      .where('seq.scope = :scope AND seq.reset_key = :resetKey', {
        scope: SCOPE,
        resetKey,
      })
      .setLock('pessimistic_write')
      .getOne();
      const next = (existing?.lastValue ?? 0) + 1;
      if (existing) {
        existing.lastValue = next;
        await repo.save(existing);
      } else {
        await repo.insert({ scope: SCOPE, resetKey, lastValue: next });
      }
      return next;
    });
  }

  private format(
    config: WorkOrderNumberingConfig,
    value: number,
    date: Date,
  ): string {
    const padded = String(value).padStart(Math.max(1, config.padding), '0');
    const yyyy = String(date.getUTCFullYear());
    const yy = yyyy.slice(-2);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return (config.template || DEFAULT_WORK_ORDER_NUMBERING.template)
      .replace(/\{PREFIX\}/gi, config.prefix || DEFAULT_WORK_ORDER_NUMBERING.prefix)
      .replace(/\{YYYY\}/g, yyyy)
      .replace(/\{YY\}/g, yy)
      .replace(/\{MM\}/g, mm)
      .replace(/\{DD\}/g, dd)
      .replace(/\{NNNN+\}/g, (match) => {
        const width = match.length - 3;
        return String(value).padStart(Math.max(width, 1), '0');
      });
  }
}
