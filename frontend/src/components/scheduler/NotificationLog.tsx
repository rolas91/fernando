import React, { useState, useMemo } from 'react';
import { NotificationLogEntry } from './NotifyWorkerModal';
import {
  X,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Globe,
  Clock,
  Smartphone,
  Mail,
  Bell,
  ChevronDown,
  ChevronRight,
  Trash2,
  RefreshCw,
  MessageSquare,
  Calendar,
  FileText,
} from 'lucide-react';

interface NotificationLogProps {
  entries: NotificationLogEntry[];
  onClose: () => void;
  onClear: () => void;
}

const NotificationLog: React.FC<NotificationLogProps> = ({
  entries,
  onClose,
  onClear,
}) => {
  const [search, setSearch] = useState('');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterChannel !== 'all' && e.channel !== filterChannel) return false;
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.workerName.toLowerCase().includes(q) &&
          !e.message.toLowerCase().includes(q) &&
          !(e.projectName || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [entries, filterChannel, filterStatus, search]);

  const stats = useMemo(() => {
    const sent = entries.filter(
      (e) => e.status === 'sent' || e.status === 'delivered',
    ).length;
    const simulated = entries.filter((e) => e.status === 'simulated').length;
    const failed = entries.filter((e) => e.status === 'failed').length;
    const pending = entries.filter((e) => e.status === 'pending').length;
    return { sent, simulated, failed, pending, total: entries.length };
  }, [entries]);

  const channelIcon = (channel: string) => {
    switch (channel) {
      case 'sms':
        return <Smartphone size={12} className="text-blue-500" />;
      case 'whatsapp':
        return <MessageSquare size={12} className="text-emerald-600" />;
      case 'email':
        return <Mail size={12} className="text-purple-500" />;
      case 'in_app':
        return <Bell size={12} className="text-green-500" />;
      default:
        return <MessageSquare size={12} className="text-gray-400" />;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'simulated':
        return <Globe size={14} className="text-blue-500" />;
      case 'failed':
        return <AlertCircle size={14} className="text-red-500" />;
      default:
        return <Clock size={14} className="text-gray-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const classes =
      {
        sent: 'bg-green-100 text-green-700',
        delivered: 'bg-green-100 text-green-700',
        simulated: 'bg-blue-100 text-blue-700',
        failed: 'bg-red-100 text-red-700',
        pending: 'bg-gray-100 text-gray-600',
      }[status] || 'bg-gray-100 text-gray-600';
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${classes}`}
      >
        {status}
      </span>
    );
  };

  const channelBadge = (channel: string) => {
    const classes =
      {
        sms: 'bg-blue-100 text-blue-700',
        whatsapp: 'bg-emerald-100 text-emerald-800',
        email: 'bg-purple-100 text-purple-700',
        in_app: 'bg-green-100 text-green-700',
      }[channel] || 'bg-gray-100 text-gray-600';
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${classes}`}
      >
        {channel === 'whatsapp' ? 'WhatsApp' : channel.replace('_', ' ')}
      </span>
    );
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[85dvh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Notification Log
              </h2>
              <p className="text-xs text-gray-500">
                {stats.total} total notifications
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
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600">
              <strong className="text-green-700">{stats.sent}</strong> sent
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-600">
              <strong className="text-blue-700">{stats.simulated}</strong>{' '}
              simulated
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-gray-600">
              <strong className="text-red-700">{stats.failed}</strong> failed
            </span>
          </div>
          <div className="flex-1" />
          {entries.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={12} /> Clear Log
            </button>
          )}
        </div>

        {}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center bg-gray-100 rounded-lg px-2.5 py-1.5 flex-1">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full placeholder-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="p-0.5 hover:bg-gray-200 rounded"
              >
                <X size={12} className="text-gray-400" />
              </button>
            )}
          </div>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            <option value="all">All Channels</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="in_app">In-App</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
          >
            <option value="all">All Status</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="simulated">Simulated</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {}
        <div className="flex-1 overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MessageSquare size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs mt-1">
                Notifications will appear here after you send them.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredEntries.map((entry) => {
                const isExpanded = expandedEntry === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() =>
                        setExpandedEntry(isExpanded ? null : entry.id)
                      }
                      className="w-full px-5 py-3 flex items-center gap-3 text-left"
                    >
                      {statusIcon(entry.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">
                            {entry.workerName}
                          </span>
                          {channelBadge(entry.channel)}
                          {statusBadge(entry.status)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <span>{formatTimestamp(entry.timestamp)}</span>
                          {entry.projectName && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span>{entry.projectName}</span>
                            </>
                          )}
                          {entry.shiftDate && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="flex items-center gap-0.5">
                                <Calendar size={9} />
                                {entry.shiftDate}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-400" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-3 ml-8">
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-xs text-gray-600 leading-relaxed">
                            {entry.message}
                          </p>
                          {entry.confirmationUrl && (
                            <a
                              href={entry.confirmationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex text-[11px] font-medium text-primary hover:underline"
                            >
                              Confirmation link
                            </a>
                          )}
                          {entry.details && (
                            <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-200">
                              {entry.details}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationLog;
