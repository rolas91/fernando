import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { WorkOrderSequence } from '../../../entities/work-order-sequence.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';

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
  constructor(
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectRepository(WorkOrderSequence)
    private readonly sequenceRepo: Repository<WorkOrderSequence>,
    private readonly dataSource: DataSource,
  ) {}

  async loadConfig(): Promise<WorkOrderNumberingConfig> {
    const settings = await this.settingsRepo.find({
      order: { name: 'ASC', id: 'ASC' },
    });
    if (settings.length === 0) return { ...DEFAULT_WORK_ORDER_NUMBERING };
    const s =
      settings.find((setting) => setting.id === 'default') ?? settings[0];
    return {
      prefix: s.workOrderNumberPrefix ?? DEFAULT_WORK_ORDER_NUMBERING.prefix,
      padding: s.workOrderNumberPadding || DEFAULT_WORK_ORDER_NUMBERING.padding,
      reset:
        (s.workOrderNumberReset as WorkOrderResetMode) ||
        DEFAULT_WORK_ORDER_NUMBERING.reset,
      template:
        s.workOrderNumberTemplate || DEFAULT_WORK_ORDER_NUMBERING.template,
    };
  }

  async nextWorkOrderNumber(referenceDate: Date = new Date()): Promise<string> {
    const config = await this.loadConfig();
    const resetKey = this.computeResetKey(config.reset, referenceDate);
    const nextValue = await this.advanceSequence(resetKey);
    return this.format(config, nextValue, referenceDate);
  }

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

  async ensureSubmissionWorkOrderNumber(submissionId: string): Promise<string> {
    const config = await this.loadConfig();
    const date = new Date();
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(FormSubmission);
      const submission = await repo.findOne({
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!submission)
        throw new NotFoundException(
          `Form submission ${submissionId} not found`,
        );
      if (submission.workOrderNumber) return submission.workOrderNumber;
      const value = await this.advanceSequence(
        this.computeResetKey(config.reset, date),
        manager,
      );
      const number = this.format(config, value, date);
      await repo.update(submissionId, { workOrderNumber: number });
      return number;
    });
  }

  private computeResetKey(mode: WorkOrderResetMode, date: Date): string {
    if (mode === 'never') return 'GLOBAL';
    const y = date.getUTCFullYear();
    if (mode === 'yearly') return String(y);
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private async advanceSequence(
    resetKey: string,
    manager?: EntityManager,
  ): Promise<number> {
    const rows = await (manager ?? this.dataSource).query(
      `INSERT INTO "work_order_sequences" ("scope", "reset_key", "last_value", "updated_at")
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT ("scope", "reset_key") DO UPDATE
       SET "last_value" = "work_order_sequences"."last_value" + 1, "updated_at" = NOW()
       RETURNING "last_value"`,
      [SCOPE, resetKey],
    );
    return Number(rows[0].last_value);
  }

  private format(
    config: WorkOrderNumberingConfig,
    value: number,
    date: Date,
  ): string {
    const yyyy = String(date.getUTCFullYear());
    const yy = yyyy.slice(-2);
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return (config.template || DEFAULT_WORK_ORDER_NUMBERING.template)
      .replace(
        /\{PREFIX\}/gi,
        () => config.prefix ?? DEFAULT_WORK_ORDER_NUMBERING.prefix,
      )
      .replace(/\{YYYY\}/gi, yyyy)
      .replace(/\{YY\}/gi, yy)
      .replace(/\{MM\}/gi, mm)
      .replace(/\{DD\}/gi, dd)
      .replace(/\{N+\}/gi, (match) => {
        const width = match.length - 2;
        return String(value).padStart(Math.max(width, config.padding, 1), '0');
      });
  }
}
