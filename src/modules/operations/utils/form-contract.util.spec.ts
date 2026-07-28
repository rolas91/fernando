import {
  normalizeFormFields,
  validateSubmissionAgainstFields,
} from './form-contract.util';

describe('shift-authorized mobile signatures', () => {
  const signatureField = {
    id: 'worker_signature',
    label: 'Employee / Foreman Signature',
    type: 'signature',
    required: true,
    rules: { requiresShiftWorkOrderAccessOnMobile: true },
  };

  it('preserves the shift WO access rule during normalization', () => {
    expect(normalizeFormFields([signatureField])[0].rules).toEqual({
      requiresShiftWorkOrderAccessOnMobile: true,
    });
  });

  it('requires the signature when the user has shift WO access', () => {
    expect(() =>
      validateSubmissionAgainstFields([normalizeFormFields([signatureField])[0]], {}, {
        canManageShiftWorkOrder: true,
      }),
    ).toThrow('Field "Employee / Foreman Signature" is required');
  });

  it('does not require a hidden signature without shift WO access', () => {
    expect(() =>
      validateSubmissionAgainstFields([normalizeFormFields([signatureField])[0]], {}, {
        canManageShiftWorkOrder: false,
      }),
    ).not.toThrow();
  });

  it('treats the former viewer-only rule as the shift WO access rule', () => {
    const legacyField = normalizeFormFields([
      {
        ...signatureField,
        rules: { hiddenForMobileRoles: ['viewer'] },
      },
    ])[0];

    expect(() =>
      validateSubmissionAgainstFields([legacyField], {}, {
        mobileRole: 'viewer',
        canManageShiftWorkOrder: true,
      }),
    ).toThrow('Field "Employee / Foreman Signature" is required');
  });
});
