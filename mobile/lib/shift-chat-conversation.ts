export function shiftChatConversationTitle(input: {
  projectNumber?: string | null;
  projectName?: string | null;
  shiftName?: string | null;
}) {
  return [
    input.projectNumber?.trim() || 'No Project Number',
    input.projectName?.trim() || 'Unknown Project',
    input.shiftName?.trim() || 'Unnamed Shift',
  ].join(' – ');
}
