import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { FormTemplate } from '../entities/form-template.entity';
import { normalizeFormFields } from '../modules/operations/utils/form-contract.util';

const WORK_ORDER_TEMPLATE_ID = 'work_order_daily_completion';

const CLIENT_CONFIRMATION_FIELDS: Record<string, unknown>[] = [
  {
    id: 'client_email',
    key: 'clientEmail',
    label: 'Client Email',
    type: 'text',
    required: false,
    placeholder: 'client@company.com',
    dataBinding: { path: 'client.email', optional: true },
    rules: {
      pattern: '^[^\\s@,;<>]+@[^\\s@,;<>]+\\.[^\\s@,;<>]+$',
    },
    ui: {
      section: 'Client Confirmation',
      sectionDescription: 'Email a copy of the signed Work Order to the client',
      layout: 'full',
      keyboardType: 'email-address',
      inputMode: 'email',
      accentColor: '#7c3aed',
      backgroundColor: '#f3e8ff',
      icon: 'mail-outline',
    },
  },
  {
    id: 'send_copy_to_client',
    key: 'sendCopyToClient',
    label:
      'Send a copy of the signed Work Order to the client immediately after submission.',
    type: 'checkbox',
    required: false,
    ui: {
      section: 'Client Confirmation',
      layout: 'full',
      defaultValue: false,
      accentColor: '#7c3aed',
      backgroundColor: '#f3e8ff',
    },
  },
];

async function seedWorkOrderClientConfirmation() {
  ensureRuntimeEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(FormTemplate);
    const existing = await repo.findOne({
      where: { id: WORK_ORDER_TEMPLATE_ID },
    });

    if (!existing) {
      console.log(
        `Work Order template ${WORK_ORDER_TEMPLATE_ID} not found. Skipping.`,
      );
      return;
    }

    const currentFields = Array.isArray(existing.fields) ? existing.fields : [];
    const newFieldIds = new Set(CLIENT_CONFIRMATION_FIELDS.map((f) => f.id));
    const hasAny = currentFields.some((field: Record<string, unknown>) =>
      newFieldIds.has(field.id),
    );

    if (hasAny) {
      console.log(
        'Work Order template already has client confirmation fields. Skipping.',
      );
      return;
    }

    const updatedFields = normalizeFormFields([
      ...currentFields,
      ...CLIENT_CONFIRMATION_FIELDS,
    ]);

    existing.fields = updatedFields;
    await repo.save(existing);
    console.log('Work Order client confirmation fields added successfully.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedWorkOrderClientConfirmation().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
