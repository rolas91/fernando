jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import { PDFDocument } from 'pdf-lib';
import { WorkOrdersService } from './work-orders.service';

async function onePagePdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

describe('WorkOrdersService PDF export', () => {
  it('merges only generated PDFs matching the status and date filters', async () => {
    const pdf = await onePagePdf();
    const service = Object.create(
      WorkOrdersService.prototype,
    ) as WorkOrdersService;
    Object.assign(service, {
      logger: { error: jest.fn() },
      formSubmissionsRepo: {
        find: jest.fn(async () => [
          {
            id: 'submission-completed',
            workOrderId: 'wo-1',
            shiftId: 'shift-completed',
            templateId: 'work-order-template',
            status: 'submitted',
            pdfUrl: 'https://files.example/completed.pdf',
          },
          {
            id: 'submission-approved',
            workOrderId: 'wo-1',
            shiftId: 'shift-approved',
            templateId: 'work-order-template',
            status: 'submitted',
            pdfUrl: 'https://files.example/approved.pdf',
          },
        ]),
      },
      formTemplatesRepo: {
        find: jest.fn(async () => [
          {
            id: 'work-order-template',
            name: 'Work Order Form',
            category: 'Work Order',
          },
        ]),
      },
      readGeneratedPdf: jest.fn(async () => pdf),
    });
    jest.spyOn(service, 'findShiftOverview').mockResolvedValue([
      {
        id: 'wo-1',
        orderNumber: 'WO-1',
        shifts: [
          {
            id: 'shift-completed',
            date: '2026-08-05',
            startTime: '08:00',
            status: 'ready_to_notify',
            roles: [],
          },
          {
            id: 'shift-approved',
            date: '2026-08-05',
            startTime: '10:00',
            status: 'ready_to_notify',
            pmApprovedAt: '2026-08-05T18:00:00.000Z',
            roles: [],
          },
        ],
      },
    ] as never);

    const completed = await service.exportGeneratedWorkOrderPdfs({
      status: 'completed',
      from: '2026-08-05',
      to: '2026-08-05',
    });
    const completedDocument = await PDFDocument.load(completed.pdf);
    expect(completed.count).toBe(1);
    expect(completedDocument.getPageCount()).toBe(1);

    const all = await service.exportGeneratedWorkOrderPdfs({
      status: 'all',
      from: '2026-08-05',
      to: '2026-08-05',
    });
    const allDocument = await PDFDocument.load(all.pdf);
    expect(all.count).toBe(2);
    expect(allDocument.getPageCount()).toBe(2);
  });
});
