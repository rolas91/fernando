export type ShiftChatMessageDto = {
  id: string;
  workOrderId: string;
  shiftId: string;
  senderUserId: string;
  senderWorkerId: string;
  senderName: string;
  kind: 'text' | 'image' | 'audio';
  body: string;
  mediaUrl: string;
  mediaName: string;
  mediaContentType: string;
  mediaSize: number;
  createdAt: string;
};
