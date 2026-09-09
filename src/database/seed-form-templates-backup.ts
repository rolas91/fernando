import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { FormTemplate } from '../entities/form-template.entity';
import { normalizeFormFields } from '../modules/operations/utils/form-contract.util';
import { DEFAULT_FORM_TEMPLATES } from './seed-dr';

const CURRENT_WORK_ORDER_FIELDS: Record<string, unknown>[] = [
  {
    id: 'dr_traffic_job_number',
    key: 'drTrafficJobNumber',
    label: 'DR Traffic Job #',
    type: 'text',
    required: true,
    dataBinding: { path: 'project.number', optional: true, editable: true },
    ui: {
      section: 'Work Order Details',
      sectionDescription: 'Fill out the job form for today',
      layout: 'half',
      defaultValue: '1916',
    },
  },
  {
    id: 'work_date',
    key: 'workDate',
    label: 'Date',
    type: 'date',
    required: true,
    dataBinding: { path: 'shift.date', optional: true, editable: true },
    ui: {
      section: 'Work Order Details',
      layout: 'half',
      defaultValue: '2026-03-30',
    },
  },
  {
    id: 'job_name',
    key: 'jobName',
    label: 'Job Name',
    type: 'text',
    required: true,
    dataBinding: { path: 'project.name', optional: true, editable: true },
    ui: {
      section: 'Work Order Details',
      layout: 'half',
      defaultValue: 'Redwood Blvd',
    },
  },
  {
    id: 'description_of_work',
    key: 'descriptionOfWork',
    label: 'Description of Work',
    type: 'textarea',
    required: true,
    placeholder: 'Describe the work completed today...',
    rules: { minLength: 3, maxLength: 2000 },
    ui: {
      section: 'Work Order Details',
      layout: 'full',
      defaultValue: 'Shift lane.',
      helperText: 'Tap tags to quickly add repeated work descriptions.',
      quickTags: [
        'Shift lane',
        'Lane closure setup',
        'Traffic control support',
        'Set cones and signage',
        'Pickup cones and material',
        'Concrete watch',
        'Flagging operations',
      ],
      tagTone: 'blue',
    },
  },
  {
    id: 'client',
    key: 'client',
    label: 'Client',
    type: 'text',
    required: true,
    dataBinding: { path: 'client.name', optional: true, editable: true },
    ui: {
      section: 'Work Order Details',
      layout: 'half',
      defaultValue: 'Rosendin',
    },
  },
  {
    id: 'contact',
    key: 'contact',
    label: 'Contact',
    type: 'text',
    required: false,
    placeholder: 'Enter contact name',
    dataBinding: { path: 'client.contactName', optional: true, editable: true },
    ui: { section: 'Work Order Details', layout: 'half' },
  },
  {
    id: 'work_shift',
    key: 'workShift',
    label: 'Work Shift',
    type: 'text',
    required: true,
    dataBinding: {
      path: 'shift.shiftTypeName',
      optional: false,
      editable: false,
    },
    ui: {
      section: 'Work Order Details',
      layout: 'full',
      helperText: 'Automatically loaded from the selected shift.',
    },
  },
  {
    id: 'worker_timesheets',
    key: 'workerTimesheets',
    label: 'Worker Timesheets',
    type: 'timesheet',
    required: true,
    dataBinding: {
      path: 'shift.timesheetWorkers',
      optional: false,
      editable: true,
    },
    ui: {
      section: 'Labor & Equipment',
      sectionDescription:
        'Review hours and collect signatures for each worker on this shift',
      layout: 'full',
      lunchTakenDefault: true,
      helperText:
        'Workers are loaded from the selected shift. Complete each worker timesheet before submitting.',
    },
  },
  {
    id: 'field_1785298083414_3n94e',
    key: 'field_1785298083414',
    label: 'Equipment & Materials Used',
    type: 'resource_usage',
    required: false,
  },
  {
    id: 'notes',
    key: 'notes',
    label: 'Notes',
    type: 'textarea',
    required: false,
    placeholder: 'Add any final notes for this work order...',
    rules: { maxLength: 2000 },
    ui: {
      section: 'Notes & Signature',
      sectionDescription: 'Final notes and confirmation',
      layout: 'full',
    },
  },
  {
    id: 'worker_signature',
    key: 'workerSignature',
    label: 'LEAD SIGNATURE',
    type: 'signature',
    required: true,
    ui: { section: 'Notes & Signature', layout: 'full' },
  },
  {
    id: 'field_1785359097384_i86ik',
    key: 'field_1785359097384',
    label: 'OWNER / GENERAL CONTRACTOR REP.',
    type: 'signature',
    required: true,
  },
];

export const CURRENT_FORM_TEMPLATES_BACKUP = DEFAULT_FORM_TEMPLATES.map(
  (template) => ({
    ...template,
    fields:
      template.id === 'work_order_daily_completion'
        ? CURRENT_WORK_ORDER_FIELDS
        : template.fields,
    assignedProjects: [],
    assignedRoles: [],
  }),
);

/**
 * Recovery-only seed for the production form contracts.
 *
 * It is intentionally insert-only: an existing template is never updated or
 * overwritten, even when its current design differs from this backup.
 */
export async function restoreMissingFormTemplates(dataSource: DataSource) {
  const repo = dataSource.getRepository(FormTemplate);
  const restored: string[] = [];
  const existing: string[] = [];

  for (const template of CURRENT_FORM_TEMPLATES_BACKUP) {
    const found = await repo.findOne({
      where: [{ id: template.id }, { name: template.name }],
    });
    if (found) {
      existing.push(template.id);
      continue;
    }

    await repo.save(
      repo.create({
        ...template,
        fields: normalizeFormFields(template.fields),
        assignedProjects: [...template.assignedProjects],
        assignedRoles: [...template.assignedRoles],
      }),
    );
    restored.push(template.id);
  }

  return { restored, existing };
}

async function seedFormTemplatesBackup() {
  ensureRuntimeEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result = await restoreMissingFormTemplates(app.get(DataSource));
    console.log(
      `Form templates recovery seed OK. restored=${result.restored.length}, existing=${result.existing.length}`,
    );
    if (result.restored.length > 0) {
      console.log(`Restored: ${result.restored.join(', ')}`);
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedFormTemplatesBackup().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
