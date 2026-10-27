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
          {
            id: 'submission-other-project',
            workOrderId: 'wo-2',
            shiftId: 'other-shift',
            templateId: 'work-order-template',
            status: 'submitted',
            pdfUrl: 'https://files.example/other.pdf',
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
      projectsRepo: {
        findOne: jest.fn(async () => ({
          number: 'P-102',
          name: 'Market Street',
        })),
      },
      readGeneratedPdf: jest.fn(async () => pdf),
    });
    jest.spyOn(service, 'findShiftOverview').mockResolvedValue([
      {
        id: 'wo-1',
        projectId: 'project-1',
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
      {
        id: 'wo-2',
        projectId: 'project-2',
        orderNumber: 'WO-2',
        shifts: [
          {
            id: 'other-shift',
            date: '2025-01-01',
            startTime: '08:00',
            status: 'ready_to_notify',
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

    const project = await service.exportGeneratedWorkOrderPdfs({
      status: 'all',
      projectId: 'project-2',
    });
    expect(project.count).toBe(1);
    expect((await PDFDocument.load(project.pdf)).getPageCount()).toBe(1);
    expect(project.fileName).toBe('Work Orders - P-102 - Market Street.pdf');

    const approved = await service.exportGeneratedWorkOrderPdfs({
      status: 'pm_approved',
      projectId: 'project-1',
    });
    expect(approved.count).toBe(1);
    await expect(
      service.exportGeneratedWorkOrderPdfs({
        status: 'all',
        projectId: 'project-2',
        from: '2026-08-05',
        to: '2026-08-05',
      }),
    ).rejects.toThrow('No completed or PM-approved');
    await expect(
      service.exportGeneratedWorkOrderPdfs({
        status: 'all',
        projectId: 'unknown',
      }),
    ).rejects.toThrow('No completed or PM-approved');
  });

  it('requires a project or complete valid date range', async () => {
    const service = Object.create(
      WorkOrdersService.prototype,
    ) as WorkOrdersService;
    await expect(
      service.exportGeneratedWorkOrderPdfs({ status: 'all' }),
    ).rejects.toThrow('Select a project');
    await expect(
      service.exportGeneratedWorkOrderPdfs({ status: 'all', projectId: ' ' }),
    ).rejects.toThrow('Select a project');
    await expect(
      service.exportGeneratedWorkOrderPdfs({
        status: 'all',
        from: '2026-01-01',
      }),
    ).rejects.toThrow('YYYY-MM-DD');
    await expect(
      service.exportGeneratedWorkOrderPdfs({
        status: 'all',
        from: '2026-02-01',
        to: '2026-01-01',
      }),
    ).rejects.toThrow('start date');
  });
});
