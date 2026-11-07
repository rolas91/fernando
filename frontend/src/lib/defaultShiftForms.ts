import type { FormTemplate } from './types';

function templateText(template: FormTemplate) {
  return `${template.name || ''} ${template.category || ''}`.toLowerCase();
}

function isWorkOrderTemplate(template: FormTemplate) {
  const text = templateText(template);
  return text.includes('work order') || /\bwo\b/.test(text);
}

function isTimesheetTemplate(template: FormTemplate) {
  return templateText(template).includes('timesheet');
}

export function getDefaultShiftFormTemplateIds(formTemplates: FormTemplate[]) {
  return Array.from(
    new Set(
      formTemplates
        .filter(
          (template) =>
            isWorkOrderTemplate(template) || isTimesheetTemplate(template),
        )
        .map((template) => template.id),
    ),
  );
}
