import type { FormTemplate } from '../../../entities/form-template.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import {
  findWorkOrderFooterSignatures,
  shouldGenerateSubmissionPdf,
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
});
