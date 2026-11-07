import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Worker, Shift, WorkOrder } from '@/lib/types';
import {
  X,
  Send,
  MessageSquare,
  Mail,
  Bell,
  Phone,
  Clock,
  MapPin,
  Users,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  Copy,
  RefreshCw,
  Smartphone,
  Globe,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';

export async function sendNotificationAction(payload: Record<string, unknown>) {
  const response = await fetch(
    `${API_BASE}${API_PREFIX}/integrations/send-notification`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok)
    throw new Error(`Notification API error ${response.status}`);
  return response.json();
}

export interface NotificationRecipient {
  worker: Worker;
  workOrderId: string;
  shiftId: string;
  roleId: string;
  shiftDate: string;
  shiftTime: string;
  roleStartTime: string;
  roleName: string;
  projectName: string;
  location: string;
  action: 'assigned' | 'removed';
  notificationSent?: boolean;
}

export interface NotificationLogEntry {
  id: string;
  workOrderId: string;
  shiftId: string;
  roleId: string;
  workerId: string;
  workerName: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'in_app';
  notificationChannel: string;
  action: 'assigned' | 'removed';
  message: string;
  status: 'sent' | 'delivered' | 'failed' | 'pending' | 'simulated';
  timestamp: string;
  requestedAt?: string;
  details?: string;
  projectName?: string;
  shiftDate?: string;
  confirmationUrl?: string;
}

interface NotifyWorkerModalProps {
  recipients: NotificationRecipient[];
  onClose: () => void;
  onNotificationSent: (entries: NotificationLogEntry[]) => void;
  isBulk?: boolean;
}

const recipientKey = (recipient: NotificationRecipient) =>
  `${recipient.workOrderId}:${recipient.shiftId}:${recipient.roleId}:${recipient.worker.id}:${recipient.action}`;

const NotifyWorkerModal: React.FC<NotifyWorkerModalProps> = ({
  recipients,
  onClose,
  onNotificationSent,
  isBulk = false,
}) => {
  const { getWorkerById, getProjectById, settings, workOrders } =
    useAppContext();
  const { toast } = useToast();

  const [channels, setChannels] = useState<
    Set<'sms' | 'whatsapp' | 'email' | 'in_app'>
  >(new Set(['in_app']));
  const [customMessage, setCustomMessage] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<NotificationLogEntry[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [expandedRecipients, setExpandedRecipients] = useState(true);
  const [selectedRecipientKeys, setSelectedRecipientKeys] = useState<
    Set<string>
  >(
    () =>
      new Set(
        recipients
          .filter((recipient) => !recipient.notificationSent)
          .map(recipientKey),
      ),
  );
  const selectedRecipients = useMemo(
    () =>
      recipients.filter((recipient) =>
        selectedRecipientKeys.has(recipientKey(recipient)),
      ),
    [recipients, selectedRecipientKeys],
  );
  const allRecipientsSelected =
    recipients.length > 0 && selectedRecipients.length === recipients.length;
  const toggleRecipient = (recipient: NotificationRecipient) => {
    const key = recipientKey(recipient);
    setSelectedRecipientKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAllRecipients = () => {
    setSelectedRecipientKeys(
      allRecipientsSelected ? new Set() : new Set(recipients.map(recipientKey)),
    );
  };

  const generateTemplate = useCallback(
    (r: NotificationRecipient) => {
      const companyName = settings.name || 'DR Traffic Control';
      const locationPhrase = r.location.trim()
        ? ` at ${r.location.trim()}`
        : '';
      if (r.action === 'assigned') {
        return `Hi ${r.worker.firstName}, you have been assigned to ${r.projectName} on ${formatDate(r.shiftDate)} Start time ${formatArrivalTime(r.roleStartTime)} day shift as ${r.roleName}${locationPhrase}. Please confirm your availability. — ${companyName}`;
      } else {
        return `Hi ${r.worker.firstName}, you have been removed from the ${r.roleName} shift at ${r.projectName} on ${formatDate(r.shiftDate)} (${formatTimeRange(r.shiftTime)}). Please contact your supervisor with any questions. — ${companyName}`;
      }
    },
    [settings.name],
  );

  const hasWorkOrderAccess = useCallback(
    (r: NotificationRecipient) =>
      workOrders
        .find((workOrder) => workOrder.id === r.workOrderId)
        ?.shifts.find((shift) => shift.id === r.shiftId)
        ?.workOrderAuthorizedWorkerIds?.includes(r.worker.id) ?? false,
    [workOrders],
  );

  const customMessageFor = useCallback(
    (r: NotificationRecipient) =>
      (customMessage || '').replace(/\{name\}/gi, r.worker.firstName),
    [customMessage],
  );

  const messageFor = useCallback(
    (r: NotificationRecipient) => {
      const baseMessage =
        useCustom && customMessage ? customMessageFor(r) : generateTemplate(r);
      if (r.action !== 'assigned' || !hasWorkOrderAccess(r)) return baseMessage;
      return `${baseMessage} You are also authorized to complete the timesheet and submit the Work Order from mobile.`;
    },
    [
      useCustom,
      customMessage,
      customMessageFor,
      generateTemplate,
      hasWorkOrderAccess,
    ],
  );

  const toggleChannel = (ch: 'sms' | 'whatsapp' | 'email' | 'in_app') => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        if (next.size > 1) next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      toast({
        title: 'Select Recipient',
        description: 'Select at least one worker to notify.',
        variant: 'destructive',
      });
      return;
    }
    if (channels.size === 0) {
      toast({
        title: 'Select Channel',
        description: 'Please select at least one notification channel.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    const results: NotificationLogEntry[] = [];

    for (const recipient of selectedRecipients) {
      const msg = messageFor(recipient);

      for (const channel of channels) {
        const logEntry: NotificationLogEntry = {
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          workOrderId: recipient.workOrderId,
          shiftId: recipient.shiftId,
          roleId: recipient.roleId,
          workerId: recipient.worker.id,
          workerName: `${recipient.worker.firstName} ${recipient.worker.lastName}`,
          channel,
          notificationChannel: channel,
          action: recipient.action,
          message: msg,
          status: 'pending',
          timestamp: new Date().toISOString(),
          projectName: recipient.projectName,
          shiftDate: recipient.shiftDate,
        };

        const confirmationPayload =
          recipient.action === 'assigned'
            ? {
                workOrderId: recipient.workOrderId,
                shiftId: recipient.shiftId,
                roleId: recipient.roleId,
                workerId: recipient.worker.id,
                projectName: recipient.projectName,
                shiftDate: recipient.shiftDate,
                shiftTime: recipient.shiftTime,
                location: recipient.location,
              }
            : undefined;

        try {
          if (channel === 'sms' || channel === 'whatsapp') {
            const data = await sendNotificationAction({
              action: channel === 'sms' ? 'send_sms' : 'send_whatsapp',
              phone: recipient.worker.phone,
              message: msg,
              workerName: `${recipient.worker.firstName} ${recipient.worker.lastName}`,
              confirmation: confirmationPayload,
            });

            if (data?.success) {
              logEntry.status = data.simulated ? 'simulated' : 'sent';
              logEntry.details = data.messageSid
                ? `SID: ${data.messageSid}`
                : data.simulated
                  ? 'Simulated delivery'
                  : 'Sent';
              logEntry.confirmationUrl = data.confirmationUrl;
              logEntry.requestedAt = data.requestedAt || logEntry.timestamp;
            } else {
              logEntry.status = 'failed';
              logEntry.details = data?.error || 'Unknown error';
            }
          } else if (channel === 'email') {
            const data = await sendNotificationAction({
              action: 'send_email',
              email: recipient.worker.email,
              message: msg,
              workerName: `${recipient.worker.firstName} ${recipient.worker.lastName}`,
              confirmation: confirmationPayload,
            });

            if (data?.success) {
              logEntry.status = data?.simulated ? 'simulated' : 'sent';
              logEntry.details = data?.note || 'Email sent';
              logEntry.confirmationUrl = data.confirmationUrl;
              logEntry.requestedAt = data.requestedAt || logEntry.timestamp;
            } else {
              logEntry.status = 'failed';
              logEntry.details = data?.error || 'Failed to send email';
            }
          } else if (channel === 'in_app') {
            const data = await sendNotificationAction({
              action: 'send_in_app',
              message: msg,
              workerName: `${recipient.worker.firstName} ${recipient.worker.lastName}`,
              email: recipient.worker.email,
              confirmation: confirmationPayload,
            });

            if (data?.success) {
              logEntry.status = data.simulated ? 'simulated' : 'delivered';
              logEntry.details = data.simulated
                ? data.note || 'FCM simulated'
                : data.messageId
                  ? `FCM: ${data.messageId}`
                  : 'Push notification sent';
              logEntry.confirmationUrl = data.confirmationUrl;
              logEntry.requestedAt = data.requestedAt || logEntry.timestamp;
            } else {
              logEntry.status = 'failed';
              logEntry.details =
                data?.error || 'Failed to send push notification';
            }
          }
        } catch (err: any) {
          logEntry.status = 'failed';
          logEntry.details = err.message || 'Network error';
        }

        results.push(logEntry);
      }
    }

    setSendResults(results);
    setShowResults(true);
    setSending(false);
    onNotificationSent(results);

    const successCount = results.filter(
      (r) =>
        r.status === 'sent' ||
        r.status === 'delivered' ||
        r.status === 'simulated',
    ).length;
    const failCount = results.filter((r) => r.status === 'failed').length;

    if (failCount === 0) {
      toast({
        title: 'Notifications Sent',
        description: `${successCount} notification${successCount > 1 ? 's' : ''} sent successfully.`,
      });
    } else if (successCount > 0) {
      toast({
        title: 'Partially Sent',
        description: `${successCount} sent, ${failCount} failed.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Send Failed',
        description: `All ${failCount} notification(s) failed to send.`,
        variant: 'destructive',
      });
    }
  };

  const channelUi: Record<
    'sms' | 'whatsapp' | 'email' | 'in_app',
    {
      activeBorder: string;
      iconActive: string;
      bar: string;
      footer: string;
      footerLabel: string;
    }
  > = {
    sms: {
      activeBorder: 'border-blue-500 bg-blue-50 shadow-sm',
      iconActive: 'text-primary',
      bar: 'bg-blue-500',
      footer: 'bg-blue-100 text-blue-700',
      footerLabel: 'SMS',
    },
    whatsapp: {
      activeBorder: 'border-emerald-500 bg-emerald-50 shadow-sm',
      iconActive: 'text-emerald-600',
      bar: 'bg-emerald-500',
      footer: 'bg-emerald-100 text-emerald-800',
      footerLabel: 'WhatsApp',
    },
    email: {
      activeBorder: 'border-purple-500 bg-purple-50 shadow-sm',
      iconActive: 'text-purple-600',
      bar: 'bg-purple-500',
      footer: 'bg-purple-100 text-purple-700',
      footerLabel: 'Email',
    },
    in_app: {
      activeBorder: 'border-green-500 bg-green-50 shadow-sm',
      iconActive: 'text-green-600',
      bar: 'bg-green-500',
      footer: 'bg-green-100 text-green-700',
      footerLabel: 'In-app',
    },
  };

  const wantsSmsSegments = channels.has('sms');

  const channelConfig = [
    {
      key: 'sms' as const,
      label: 'SMS',
      icon: Smartphone,
      desc: 'Send a text message',
    },
    {
      key: 'whatsapp' as const,
      label: 'WhatsApp',
      icon: MessageSquare,
      desc: 'Send a message to the selected channel',
    },
    {
      key: 'email' as const,
      label: 'Email',
      icon: Mail,
      desc: 'Email notification',
    },
    {
      key: 'in_app' as const,
      label: 'In-App',
      icon: Bell,
      desc: 'In-app notification',
    },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'simulated':
        return <Globe size={14} className="text-blue-500" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-500" />;
      case 'pending':
        return <Loader2 size={14} className="text-gray-400 animate-spin" />;
      default:
        return <Clock size={14} className="text-gray-400" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'simulated':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-xl max-h-[90dvh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Send size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {isBulk ? 'Bulk Notify Workers' : 'Notify Worker'}
              </h2>
              <p className="text-xs text-gray-500">
                {selectedRecipients.length} of {recipients.length} recipient
                {recipients.length > 1 ? 's' : ''} selected ·{' '}
                {isBulk
                  ? 'Project assignment confirmations'
                  : 'Shift assignment notification'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <button
                onClick={() => setExpandedRecipients(!expandedRecipients)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                {expandedRecipients ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <Users size={14} />
                Recipients ({selectedRecipients.length}/{recipients.length})
              </button>
              <button
                type="button"
                onClick={toggleAllRecipients}
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                {allRecipientsSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            {expandedRecipients && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {recipients.map((r) => (
                  <label
                    key={recipientKey(r)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRecipientKeys.has(recipientKey(r))}
                      onChange={() => toggleRecipient(r)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {r.worker.firstName[0]}
                      {r.worker.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {r.worker.firstName} {r.worker.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {r.worker.phone && (
                          <span className="flex items-center gap-0.5">
                            <Phone size={9} /> {r.worker.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock size={9} /> {formatDate(r.shiftDate)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        r.action === 'assigned'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {r.action === 'assigned' ? 'Assigned' : 'Removed'}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Notification Channels
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {channelConfig.map((ch) => {
                const isActive = channels.has(ch.key);
                const ui = channelUi[ch.key];
                return (
                  <button
                    key={ch.key}
                    onClick={() => toggleChannel(ch.key)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? ui.activeBorder
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ch.icon
                        size={16}
                        className={isActive ? ui.iconActive : 'text-gray-400'}
                      />
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-gray-800' : 'text-gray-500'}`}
                      >
                        {ch.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">{ch.desc}</p>
                    {isActive && (
                      <div
                        className={`mt-1.5 w-full h-0.5 rounded ${ui.bar}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">
                Message
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseCustom(false)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    !useCustom
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Template
                </button>
                <button
                  onClick={() => setUseCustom(true)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    useCustom
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {useCustom ? (
              <div>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Type your custom message... Use {name} for worker's first name."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                  maxLength={1600}
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-gray-400">
                    Use{' '}
                    <code className="bg-gray-100 px-1 rounded">{'{name}'}</code>{' '}
                    for worker's first name
                  </p>
                  <span
                    className={`text-[10px] ${wantsSmsSegments && customMessage.length > 160 ? 'text-amber-600' : 'text-gray-400'}`}
                  >
                    {customMessage.length}/1600
                    {wantsSmsSegments &&
                      customMessage.length > 160 &&
                      ' (2+ SMS segments)'}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-gray-500">
                  {selectedRecipients.length > 1
                    ? `${selectedRecipients.length} personalized previews (one per shift). Each selected worker receives the message matching their own shift.`
                    : 'Message preview'}
                </p>
                <button
                  onClick={() => {
                    const text = selectedRecipients
                      .map((r) => messageFor(r))
                      .join('\n\n---\n\n');
                    navigator.clipboard.writeText(text);
                    toast({
                      title: 'Copied',
                      description: `${selectedRecipients.length} message(s) copied to clipboard`,
                    });
                  }}
                  className="text-xs text-primary hover:text-primary/90 flex items-center gap-1"
                >
                  <Copy size={10} /> Copy all
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedRecipients.map((r, idx) => {
                  const msg = messageFor(r);
                  return (
                    <div
                      key={`${r.shiftId}-${r.worker.id}-${idx}`}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {r.worker.firstName[0]}
                            {r.worker.lastName[0]}
                          </div>
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {r.worker.firstName} {r.worker.lastName}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1 flex-shrink-0">
                          <Clock size={10} /> {formatDate(r.shiftDate)}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mb-1.5 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-0.5">
                          <MapPin size={9} /> {r.projectName} · {r.roleName}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={9} /> {formatTimeRange(r.shiftTime)}
                        </span>
                      </p>
                      <div className="flex items-start gap-2">
                        <FileText
                          size={12}
                          className="text-gray-400 mt-0.5 flex-shrink-0"
                        />
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {msg}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-200">
                        <span
                          className={`text-[10px] ${wantsSmsSegments && msg.length > 160 ? 'text-amber-600' : 'text-gray-400'}`}
                        >
                          {msg.length} chars
                          {wantsSmsSegments &&
                            msg.length > 160 &&
                            ' (2+ SMS segments)'}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg);
                            toast({
                              title: 'Copied',
                              description: 'Message copied to clipboard',
                            });
                          }}
                          className="text-[11px] text-primary hover:text-primary/90 flex items-center gap-1"
                        >
                          <Copy size={10} /> Copy
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {}
          {showResults && sendResults.length > 0 && (
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Delivery Results
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {sendResults.map((result) => (
                  <div
                    key={result.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border ${statusColor(result.status)}`}
                  >
                    {statusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {result.workerName}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${channelUi[result.channel].footer}`}
                        >
                          {channelUi[result.channel].footerLabel}
                        </span>
                      </div>
                      {result.details && (
                        <p className="text-[10px] opacity-70 truncate">
                          {result.details}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium capitalize ${
                        result.status === 'sent' ||
                        result.status === 'delivered'
                          ? 'text-green-600'
                          : result.status === 'simulated'
                            ? 'text-primary'
                            : result.status === 'failed'
                              ? 'text-red-600'
                              : 'text-gray-500'
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {Array.from(channels).map((ch) => (
              <span
                key={ch}
                className={`px-2 py-0.5 rounded-full font-medium ${channelUi[ch].footer}`}
              >
                {channelUi[ch].footerLabel}
              </span>
            ))}
            <span className="text-gray-400">·</span>
            <span>
              {selectedRecipients.length} selected recipient
              {selectedRecipients.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white transition-colors"
            >
              {showResults ? 'Close' : 'Cancel'}
            </button>
            {!showResults && (
              <button
                onClick={handleSend}
                disabled={
                  sending ||
                  channels.size === 0 ||
                  selectedRecipients.length === 0
                }
                className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Send {isBulk ? 'to Selected' : 'Notification'}
                  </>
                )}
              </button>
            )}
            {showResults && (
              <button
                onClick={() => {
                  setShowResults(false);
                  setSendResults([]);
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Send Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTimeRange(timeStr: string): string {
  const parts = timeStr.split('-');
  return parts
    .map((t) => {
      const [h, m] = t.trim().split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const dh = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${dh}:${m} ${ampm}`;
    })
    .join(' - ');
}

function formatArrivalTime(timeStr: string): string {
  return formatTimeRange(timeStr.split('-')[0] || timeStr);
}

export default NotifyWorkerModal;
