jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import { CompanySettingsService } from './company-settings.service';
import { NumberingService } from './numbering.service';
import { FormSubmissionsService } from './form-submissions.service';
import { CreateCompanySettingsDto } from '../dto/create-company-settings.dto';
import { validate } from 'class-validator';

describe('Settings to assignment numbering to PDF Builder', () => {
  it('uses saved default settings for previews and new numbers, preserving existing WO numbers', async () => {
    const current: any = {
      id: 'default',
      name: 'Z Company',
      workOrderNumberPrefix: 'ASN',
      workOrderNumberPadding: 4,
      workOrderNumberReset: 'never',
      workOrderNumberTemplate: '{PREFIX}-{YYYY}-{NNNN}',
      workOrderPdfBuilder: {
        version: 2,
        templateId: 'wo-template',
        fields: { workOrderNumber: 'old_number' },
        layout: {
          labels: { documentTitle: 'SAVED BUILDER' },
          filenameTemplate: '{workOrderNumber}',
        },
      },
    };
    const repo: any = {
      find: jest.fn(async () => [
        {
          id: 'other',
          name: 'A Company',
          workOrderNumberTemplate: 'OTHER-{NNNN}',
        },
        current,
      ]),
      findOne: jest.fn(async () => current),
      save: jest.fn(async (value) => value),
    };
    const company = new CompanySettingsService(repo, {
      emitTableUpdated: jest.fn(),
    } as any);
    const sequence: any = { findOne: jest.fn(async () => ({ lastValue: 41 })) };
    const numbering = new NumberingService(repo, sequence, {} as any);
    const advance = jest
      .spyOn(numbering as any, 'advanceSequence')
      .mockResolvedValue(42);
    await company.update('default', {
      workOrderNumberTemplate: '{NNNNNN}',
      workOrderNumberPadding: 6,
    });
    expect((await company.findAll())[0].id).toBe('default');
    expect((await numbering.previewNextWorkOrderNumber()).number).toBe(
      '000042',
    );

    const service: any = Object.create(FormSubmissionsService.prototype);
    const persistedNumbers = new Map<string, string>();
    jest
      .spyOn(numbering, 'ensureSubmissionWorkOrderNumber')
      .mockImplementation(async (id) => {
        if (!persistedNumbers.has(id))
          persistedNumbers.set(id, await numbering.nextWorkOrderNumber());
        return persistedNumbers.get(id)!;
      });
    const upload = jest.fn(async () => ({ url: '/generated.pdf' }));
    Object.assign(service, {
      numbering,
      companySettings: company,
      spacesStorage: {
        isConfigured: () => true,
        uploadGeneratedWorkOrderPdf: upload,
      },
    });
    const preview = await service.buildPdfBuilderPreview(
      current.workOrderPdfBuilder,
    );
    expect(preview.toString()).toContain('000042');
    expect(advance).not.toHaveBeenCalled();
    const context: any = {
      workOrder: { orderNumber: 'ASN-2026-001' },
      project: { number: 'QA-PROJECT' },
      workers: [],
      equipment: [],
      materials: [],
      workOrderTypes: [],
    };
    service.loadWorkOrderPdfContext = jest.fn(async () => context);
    const submission: any = {
      id: 's1',
      workOrderId: 'wo1',
      data: { old_number: 'ASN-2026-001' },
    };
    const template: any = { id: 'wo-template', name: 'Work Order', fields: [] };
    await service.generatePdf(submission, template);
    let file = (upload.mock.calls as any)[0][0];
    expect(file.buffer.toString()).toContain('000042');
    expect(file.buffer.toString()).toContain('SAVED BUILDER');
    expect(file.buffer.toString()).not.toContain('ASN-2026-001');
    expect(file.originalname).toContain('000042');

    context.workOrder.orderNumber = 'ASN-2026-001';
    await service.generatePdf(submission, template);
    file = (upload.mock.calls as any)[1][0];
    expect(file.buffer.toString()).toContain('000042');
    expect(file.buffer.toString()).not.toContain('ASN-2026-001');
    expect(advance).toHaveBeenCalledTimes(1);

    await service.generatePdf(submission, {
      ...template,
      id: 'different-template',
    });
    file = (upload.mock.calls as any)[2][0];
    expect(file.buffer.toString()).not.toContain('SAVED BUILDER');
    expect(file.buffer.toString()).toContain('000042');
  });

  it.each(['fixed-number', '{UNKNOWN}-{NNNN}', '', '{NNNN'])(
    'rejects invalid numbering template %p',
    async (template) => {
      const dto = Object.assign(new CreateCompanySettingsDto(), {
        id: 'default',
        name: 'Company',
        workOrderNumberTemplate: template,
      });
      expect(
        (await validate(dto)).some(
          (error) => error.property === 'workOrderNumberTemplate',
        ),
      ).toBe(true);
    },
  );
});
