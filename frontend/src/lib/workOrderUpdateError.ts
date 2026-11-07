type UpdateErrorFeedback = {
  title: string;
  description: string;
};

function shortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function workOrderUpdateErrorFeedback(
  error: unknown,
): UpdateErrorFeedback {
  const raw = error instanceof Error ? error.message : '';
  const dateRangeMatch = raw.match(
    /Assignment dates \((\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})\) must fall within project dates \((\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})\)/i,
  );

  if (dateRangeMatch) {
    const [, assignmentStart, assignmentEnd, projectStart, projectEnd] =
      dateRangeMatch;
    return {
      title: 'Shift cannot be updated',
      description:
        `This assignment runs from ${shortDate(assignmentStart)} to ${shortDate(assignmentEnd)}, ` +
        `but the project only runs from ${shortDate(projectStart)} to ${shortDate(projectEnd)}. ` +
        'Update the assignment or project dates first.',
    };
  }

  const shiftDateMatch = raw.match(
    /Shift date "(\d{4}-\d{2}-\d{2})" is outside the assignment range (\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (shiftDateMatch) {
    const [, shiftDate, assignmentStart, assignmentEnd] = shiftDateMatch;
    return {
      title: 'Shift date is not allowed',
      description:
        `The shift date (${shortDate(shiftDate)}) must be between ` +
        `${shortDate(assignmentStart)} and ${shortDate(assignmentEnd)}.`,
    };
  }

  const cleanMessage = raw.replace(/^API \d+ on [^:]+:\s*/i, '').trim();
  return {
    title: 'Unable to update shift',
    description:
      cleanMessage || 'Please review the shift information and try again.',
  };
}
