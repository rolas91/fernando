import {
  normalizeFormFields,
  validateSubmissionAgainstFields,
  normalizeSubmissionData,
} from './form-contract.util';

describe('client copy checkbox submission', () => {
  const fields = normalizeFormFields([
    { id: 'send_copy_to_client', label: 'Send client copy', type: 'checkbox' },
  ]);

  it.each([['false', false], ['true', true]])(
    'normalizes %s before checkbox validation',
    (input, expected) => {
      const data = normalizeSubmissionData({
        send_copy_to_client: input,
        sendCopyToClient: input,
      });
      expect(data.send_copy_to_client).toBe(expected);
      expect(data.sendCopyToClient).toBe(expected);
      expect(() => validateSubmissionAgainstFields(fields, data)).not.toThrow();
    },
  );

  it('still rejects unsupported checkbox values', () => {
    const data = normalizeSubmissionData({ send_copy_to_client: 'yes' });
    expect(() => validateSubmissionAgainstFields(fields, data)).toThrow(
      'must be boolean',
    );
  });
});

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
      validateSubmissionAgainstFields(
        [normalizeFormFields([signatureField])[0]],
        {},
        {
          canManageShiftWorkOrder: true,
        },
      ),
    ).toThrow('Field "Employee / Foreman Signature" is required');
  });

  it('does not require a hidden signature without shift WO access', () => {
    expect(() =>
      validateSubmissionAgainstFields(
        [normalizeFormFields([signatureField])[0]],
        {},
        {
          canManageShiftWorkOrder: false,
        },
      ),
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
      validateSubmissionAgainstFields(
        [legacyField],
        {},
        {
          mobileRole: 'viewer',
          canManageShiftWorkOrder: true,
        },
      ),
    ).toThrow('Field "Employee / Foreman Signature" is required');
  });
});

describe('Work Order Types field contract', () => {
  const field = {
    id: 'work_order_types',
    label: 'Work Order Type',
    type: 'work_order_types',
    required: true,
  };

  it('preserves the component type during normalization', () => {
    expect(normalizeFormFields([field])[0].type).toBe('work_order_types');
  });

  it('accepts a list of selected and custom labels', () => {
    expect(() =>
      validateSubmissionAgainstFields([normalizeFormFields([field])[0]], {
        work_order_types: ['Field Service', 'Emergency Setup'],
      }),
    ).not.toThrow();
  });

  it('rejects non-list values', () => {
    expect(() =>
      validateSubmissionAgainstFields([normalizeFormFields([field])[0]], {
        work_order_types: 'Field Service',
      }),
    ).toThrow('must be a list of Work Order Types');
  });
});
