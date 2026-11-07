import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Reply,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import type { Shift, WorkOrder } from '@/lib/types';
import { shiftChatConversationTitle } from '@/lib/shiftChatConversation';
import {
  connectShiftChatSocket,
  deleteShiftChatMessage,
  fetchShiftChatMessages,
  markShiftChatRead,
  sendShiftChatMessage,
  type ShiftChatMessage,
  uploadShiftChatFile,
} from '@/lib/shiftChat';

type Props = {
  open: boolean;
  shift: Shift | null;
  workOrder: WorkOrder | null;
  onClose: () => void;
  onRead?: (shiftId: string) => void;
};

function messagePreview(message: ShiftChatMessage) {
  if (message.body?.trim()) return message.body.trim().slice(0, 140);
  if (message.kind === 'image') return 'Photo';
  if (message.kind === 'audio') return 'Voice message';
  return 'Message';
}

function dateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function ShiftChatAside({
  open,
  shift,
  workOrder,
  onClose,
  onRead,
}: Props) {
  const { user } = useAuth();
  const { getProjectById } = useAppContext();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ShiftChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ShiftChatMessage | null>(null);
  const [recording, setRecording] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  const shiftId = shift?.id || '';
  const project = workOrder?.projectId
    ? getProjectById(workOrder.projectId)
    : undefined;
  const title = shiftChatConversationTitle(project, workOrder, shift);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
  };

  useEffect(() => {
    if (!open || !shiftId) return;
    let active = true;
    setLoading(true);
    fetchShiftChatMessages(shiftId)
      .then((rows) => {
        if (!active) return;
        setMessages(rows);
        requestAnimationFrame(() => scrollToBottom('auto'));
      })
      .catch((error) => {
        toast({
          title: 'Unable to load chat',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      })
      .finally(() => active && setLoading(false));
    void markShiftChatRead(shiftId)
      .then(() => onRead?.(shiftId))
      .catch(() => undefined);

    const socket = connectShiftChatSocket({
      shiftId,
      onMessage: (message) => {
        if (!active) return;
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
        void markShiftChatRead(shiftId)
          .then(() => onRead?.(shiftId))
          .catch(() => undefined);
        requestAnimationFrame(() => scrollToBottom());
      },
      onMessageDeleted: ({ id }) => {
        if (!active) return;
        setMessages((current) => current.filter((item) => item.id !== id));
        setReplyingTo((current) => (current?.id === id ? null : current));
      },
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [open, onRead, shiftId, toast]);

  useEffect(() => {
    if (!open) {
      setDraft('');
      setReplyingTo(null);
      setShowJump(false);
    }
  }, [open]);

  const replyPayload = useMemo(
    () =>
      replyingTo
        ? {
            replyToMessageId: replyingTo.id,
            replyToSenderName: replyingTo.senderName,
            replyToKind: replyingTo.kind,
            replyToPreview: messagePreview(replyingTo),
          }
        : {},
    [replyingTo],
  );

  const sendText = async () => {
    if (!shiftId || !draft.trim() || sending) return;
    const body = draft.trim();
    setDraft('');
    setSending(true);
    try {
      await sendShiftChatMessage(shiftId, {
        body,
        kind: 'text',
        ...replyPayload,
      });
      setReplyingTo(null);
    } catch (error) {
      setDraft(body);
      toast({
        title: 'Unable to send message',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File, kind: 'image' | 'audio') => {
    if (!shiftId) return;
    setSending(true);
    try {
      const upload = await uploadShiftChatFile(shiftId, file);
      if (!upload) throw new Error('Upload failed.');
      await sendShiftChatMessage(shiftId, {
        kind,
        mediaUrl: upload.url,
        mediaName: upload.name,
        mediaContentType: upload.contentType,
        mediaSize: upload.size,
        ...replyPayload,
      });
      setReplyingTo(null);
    } catch (error) {
      toast({
        title: 'Unable to send attachment',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const file = new File([blob], `voice-${Date.now()}.webm`, {
          type: blob.type || 'audio/webm',
        });
        void sendFile(file, 'audio');
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast({
        title: 'Microphone unavailable',
        description: 'Allow microphone access to record a voice message.',
        variant: 'destructive',
      });
    }
  };

  const removeMessage = async (message: ShiftChatMessage) => {
    if (!shiftId || message.senderUserId !== user?.id) return;
    if (!window.confirm('Delete this message for everyone in this shift chat?'))
      return;
    try {
      await deleteShiftChatMessage(shiftId, message.id);
    } catch (error) {
      toast({
        title: 'Unable to delete message',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!open || !shift || !workOrder) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[70] cursor-default bg-black/35"
      />
      <aside className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-[460px] flex-col border-l border-border bg-background shadow-2xl">
        <header className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-bold text-foreground">
                  Shift Chat
                </h2>
                <span
                  className="h-2 w-2 rounded-full bg-emerald-500"
                  title="Live"
                />
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dateLabel(shift.date)} | {shift.startTime}-{shift.endTime}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          className="relative flex-1 overflow-y-auto bg-muted/25 px-4 py-5"
          onScroll={(event) => {
            const node = event.currentTarget;
            setShowJump(
              node.scrollHeight - node.scrollTop - node.clientHeight > 180,
            );
          }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Send size={20} />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">
                No messages yet
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Start the conversation for this shift. Assigned workers will
                receive a notification.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const mine = message.senderUserId === user?.id;
                return (
                  <div
                    key={message.id}
                    className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[84%] ${mine ? 'items-end' : 'items-start'}`}
                    >
                      {!mine && (
                        <p className="mb-1 px-1 text-[11px] font-semibold text-muted-foreground">
                          {message.senderName}
                        </p>
                      )}
                      <div
                        className={`rounded-xl px-3 py-2 shadow-sm ${
                          mine
                            ? 'rounded-br-sm bg-primary text-primary-foreground'
                            : 'rounded-bl-sm border border-border bg-card text-card-foreground'
                        }`}
                      >
                        {message.replyToMessageId && (
                          <div
                            className={`mb-2 rounded-md border-l-2 px-2 py-1.5 text-xs ${mine ? 'border-white/70 bg-white/10' : 'border-primary bg-primary/5'}`}
                          >
                            <p className="font-semibold">
                              {message.replyToSenderName || 'Message'}
                            </p>
                            <p className="mt-0.5 line-clamp-2 opacity-75">
                              {message.replyToPreview}
                            </p>
                          </div>
                        )}
                        {message.kind === 'image' && message.mediaUrl && (
                          <a
                            href={message.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={message.mediaUrl}
                              alt={message.mediaName || 'Chat attachment'}
                              className="mb-2 max-h-64 w-full rounded-md object-cover"
                            />
                          </a>
                        )}
                        {message.kind === 'audio' && message.mediaUrl && (
                          <audio
                            controls
                            preload="metadata"
                            className="mb-1 h-9 w-full max-w-[280px]"
                          >
                            <source
                              src={message.mediaUrl}
                              type={message.mediaContentType || undefined}
                            />
                          </audio>
                        )}
                        {message.body && (
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {message.body}
                          </p>
                        )}
                        <div
                          className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                        >
                          <span>{timeLabel(message.createdAt)}</span>
                          <button
                            type="button"
                            onClick={() => setReplyingTo(message)}
                            title="Reply"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Reply size={12} />
                          </button>
                          {mine && (
                            <button
                              type="button"
                              onClick={() => void removeMessage(message)}
                              title="Delete"
                              className="opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {showJump && (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className="sticky bottom-2 left-full inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              title="Jump to latest"
            >
              <ArrowDown size={16} />
            </button>
          )}
        </div>

        <footer className="border-t border-border bg-background p-4">
          {replyingTo && (
            <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted px-3 py-2">
              <Reply size={14} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {replyingTo.senderName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {messagePreview(replyingTo)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                title="Cancel reply"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void sendFile(file, 'image');
            }}
          />
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={sending || recording}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
              title="Send image"
            >
              <ImageIcon size={18} />
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void toggleRecording()}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${recording ? 'border-red-500 bg-red-500 text-white' : 'border-border text-muted-foreground hover:bg-muted'} disabled:opacity-50`}
              title={recording ? 'Stop recording' : 'Record voice message'}
            >
              {recording ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Mic size={18} />
              )}
            </button>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendText();
                }
              }}
              rows={1}
              placeholder={
                recording
                  ? 'Recording voice message...'
                  : 'Message this shift...'
              }
              disabled={recording}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              disabled={sending || recording || !draft.trim()}
              onClick={() => void sendText()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              title="Send message"
            >
              {sending ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Send size={17} />
              )}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <Paperclip size={11} className="mr-1 inline" />
            Messages, photos and voice notes are shared with workers assigned to
            this shift.
          </p>
        </footer>
      </aside>
    </>
  );
}
