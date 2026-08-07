import { shiftChatConversationTitle } from '../utils/shift-chat-conversation.util';

describe('shiftChatConversationTitle', () => {
  it('uses Project Number – Project Name – Shift Name order', () => {
    expect(
      shiftChatConversationTitle({
        projectNumber: '1700',
        projectName: 'Main Street',
        shiftName: 'Night Shift',
      }),
    ).toBe('1700 – Main Street – Night Shift');
  });

  it('keeps all three positions identifiable when data is incomplete', () => {
    expect(shiftChatConversationTitle({})).toBe(
      'No Project Number – Unknown Project – Unnamed Shift',
    );
  });
});
