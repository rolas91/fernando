import type { FormTemplate } from '../../../entities/form-template.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { shouldGenerateSubmissionPdf } from './form-submissions.service';

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
