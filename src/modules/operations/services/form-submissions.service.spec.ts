import type { FormTemplate } from '../../../entities/form-template.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import {
  findWorkOrderFooterSignatures,
  shouldGenerateSubmissionPdf,
  workOrderPdfTypeChecks,
} from './form-submissions.service';

function template(category: string): FormTemplate {
  return {
    category,
    name: category,
  } as FormTemplate;
}

function actor(
  role: UserAccessContext['role'],
  permissions: string[] = [],
): UserAccessContext {
  return {
    role,
    permissions,
  } as UserAccessContext;
}

describe('shouldGenerateSubmissionPdf', () => {
  it('does not generate a timesheet PDF for a viewer', () => {
    expect(
      shouldGenerateSubmissionPdf(
        template('timesheet'),
        actor('viewer', [
          'mobile.timesheets.submit',
          'timesheets.write',
          'form-submissions.write',
        ]),
      ),
    ).toBe(false);
  });

  it('does not generate a timesheet PDF for scheduler roles', () => {
    expect(
      shouldGenerateSubmissionPdf(
        template('timesheet'),
        actor('scheduler', ['mobile.timesheets.submit']),
      ),
    ).toBe(false);
  });

  it('does not change PDF generation for other form categories', () => {
    expect(
      shouldGenerateSubmissionPdf(
        template('work_order'),
        actor('viewer', ['mobile.work-orders.submit']),
      ),
    ).toBe(true);
  });
});

describe('findWorkOrderFooterSignatures', () => {
  const signature = {
    type: 'signature-image',
    dataUrl: 'data:image/png;base64,customer-signature',
  };

  it('does not classify an owner/general contractor rep signature as the DR Traffic signature', () => {
    const workOrderTemplate = {
      fields: [
        {
          id: 'owner_general_contractor_rep_signature',
          key: 'ownerGeneralContractorRepSignature',
          label: 'Owner / General Contractor Rep. Signature',
          type: 'signature',
        },
      ],
    } as FormTemplate;

    const result = findWorkOrderFooterSignatures(
      { owner_general_contractor_rep_signature: signature },
      workOrderTemplate,
    );

    expect(result.foremanSignature).toBeUndefined();
    expect(result.customerSignature).toBe(signature);
  });

  it('keeps distinct DR Traffic and customer signatures in their respective slots', () => {
    const drTrafficSignature = {
      type: 'signature-image',
      dataUrl: 'data:image/png;base64,dr-traffic-signature',
    };
    const workOrderTemplate = {
      fields: [
        {
          id: 'dr_traffic_rep_signature',
          label: 'DR Traffic Rep. Signature',
          type: 'signature',
        },
        {
          id: 'customer_approval_signature',
          label: 'Customer Approval Signature',
          type: 'signature',
        },
      ],
    } as FormTemplate;

    const result = findWorkOrderFooterSignatures(
      {
        dr_traffic_rep_signature: drTrafficSignature,
        customer_approval_signature: signature,
      },
      workOrderTemplate,
    );

    expect(result.foremanSignature).toBe(drTrafficSignature);
    expect(result.customerSignature).toBe(signature);
  });

  it('never paints the same signature payload in both footer slots', () => {
    const workOrderTemplate = {
      fields: [
        {
          id: 'employee_signature',
          label: 'Employee Signature',
          type: 'signature',
        },
        {
          id: 'customer_approval_signature',
          label: 'Customer Approval Signature',
          type: 'signature',
        },
      ],
    } as FormTemplate;

    const result = findWorkOrderFooterSignatures(
      {
        employee_signature: signature,
        customer_approval_signature: { ...signature },
      },
      workOrderTemplate,
    );

    expect(result.foremanSignature).toBe(signature);
    expect(result.customerSignature).toBeNull();
  });

  it('maps Lead Signature to the DR Traffic footer slot', () => {
    const leadSignature = {
      type: 'signature-image',
      dataUrl: 'data:image/png;base64,lead-signature',
    };
    const workOrderTemplate = {
      ...template('Work Order'),
      fields: [
        {
          id: 'worker_signature',
          label: 'LEAD SIGNATURE',
          type: 'signature',
        },
      ],
    } as FormTemplate;

    const result = findWorkOrderFooterSignatures(
      { worker_signature: leadSignature },
      workOrderTemplate,
    );

    expect(result.foremanSignature).toBe(leadSignature);
  });

  it('uses explicit PDF Builder mappings before semantic name matching', () => {
    const leadSignature = {
      type: 'signature-image',
      dataUrl: 'data:image/png;base64,mapped-lead-signature',
    };

    const result = findWorkOrderFooterSignatures(
      { arbitrary_signature_field: leadSignature },
      template('Work Order'),
      [],
      { fields: { leadSignature: 'arbitrary_signature_field' } },
    );

    expect(result.foremanSignature).toBe(leadSignature);
  });
});

describe('workOrderPdfTypeChecks', () => {
  it('always returns the five fixed PDF options in their required order', () => {
    expect(workOrderPdfTypeChecks([])).toEqual([
      { label: 'Field Service', checked: false },
      { label: 'Internal Sale', checked: false },
      { label: 'Sales', checked: false },
      { label: 'On Rent', checked: false },
      { label: 'Off Rent', checked: false },
    ]);
  });

  it('checks matching PDF types from materials when the shift has no selected types', () => {
    const checks = workOrderPdfTypeChecks([], ['Sales', 'On Rent', 'Off Rent']);
    const selected = checks
      .filter((item) => item.checked)
      .map((item) => item.label);

    expect(selected).toEqual(['Sales', 'On Rent', 'Off Rent']);
  });

  it('checks only exact normalized matches from the shift configuration', () => {
    expect(
      workOrderPdfTypeChecks([' field   service ', 'ON RENT', 'Sale']),
    ).toEqual([
      { label: 'Field Service', checked: true },
      { label: 'Internal Sale', checked: false },
      { label: 'Sales', checked: false },
      { label: 'On Rent', checked: true },
      { label: 'Off Rent', checked: false },
    ]);
  });
});
