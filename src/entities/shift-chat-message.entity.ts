import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ShiftChatMessageKind = 'text' | 'image' | 'audio';

@Entity('shift_chat_messages')
export class ShiftChatMessage {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64 })
  workOrderId: string;

  @Column({ name: 'shift_id', type: 'varchar', length: 64 })
  shiftId: string;

  @Column({ name: 'sender_user_id', type: 'varchar', length: 64, default: '' })
  senderUserId: string;

  @Column({ name: 'sender_worker_id', type: 'varchar', length: 64 })
  senderWorkerId: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 180 })
  senderName: string;

  @Column({ type: 'varchar', length: 16, default: 'text' })
  kind: ShiftChatMessageKind;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ name: 'media_url', type: 'text', default: '' })
  mediaUrl: string;

  @Column({ name: 'media_name', type: 'varchar', length: 240, default: '' })
  mediaName: string;

  @Column({ name: 'media_content_type', type: 'varchar', length: 120, default: '' })
  mediaContentType: string;

  @Column({ name: 'media_size', type: 'int', default: 0 })
  mediaSize: number;

  @Column({ name: 'reply_to_message_id', type: 'varchar', length: 64, default: '' })
  replyToMessageId: string;

  @Column({ name: 'reply_to_sender_name', type: 'varchar', length: 180, default: '' })
  replyToSenderName: string;

  @Column({ name: 'reply_to_kind', type: 'varchar', length: 16, default: '' })
  replyToKind: string;

  @Column({ name: 'reply_to_preview', type: 'varchar', length: 280, default: '' })
  replyToPreview: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
