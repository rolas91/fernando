jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import { FormSubmissionsService } from './form-submissions.service';

describe('PDF Builder numbering preview', () => {
  it.each([undefined, { workOrderNumber: 'custom_number' }])(
    'uses the saved numbering preview, including mapped fields %p',
    async (fields) => {
      const service = Object.create(
        FormSubmissionsService.prototype,
      ) as FormSubmissionsService;
      const previewNextWorkOrderNumber = jest
        .fn()
        .mockResolvedValue({ number: '00042' });
      Object.assign(service, { numbering: { previewNextWorkOrderNumber } });
      const pdf = await service.buildPdfBuilderPreview({ version: 2, fields });
      expect(pdf.toString()).toContain('00042');
      expect(pdf.toString()).not.toContain('ASN-2026-001');
      expect(previewNextWorkOrderNumber).toHaveBeenCalledTimes(1);
    },
  );
});
