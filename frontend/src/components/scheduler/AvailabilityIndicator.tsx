import React, { useState, useRef, useEffect } from 'react';
import { AvailabilityRequest } from '@/lib/types';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export type AvailabilityLevel = 'green' | 'yellow' | 'red';

export interface AvailabilityInfo {
  level: AvailabilityLevel;
  label: string;
  requests: AvailabilityRequest[];
}

export function getWorkerAvailability(
  workerId: string,
  dates: string[],
  availabilityRequests: AvailabilityRequest[],
): AvailabilityInfo {
  if (dates.length === 0) {
    return { level: 'green', label: 'Available', requests: [] };
  }

  const matchingRequests = availabilityRequests.filter((ar) => {
    if (ar.workerId !== workerId) return false;
    const reqStart = ar.date;
    const reqEnd = ar.endDate || ar.date;

    return dates.some((d) => d >= reqStart && d <= reqEnd);
  });

  if (matchingRequests.length === 0) {
    return { level: 'green', label: 'Available', requests: [] };
  }

  const redRequests = matchingRequests.filter((ar) => {
    if (ar.type === 'time_off' && ar.status === 'approved') return true;
    if (
      ar.type === 'unavailable' &&
      (ar.status === 'approved' || ar.status === 'pending')
    )
      return true;
    return false;
  });

  if (redRequests.length > 0) {
    const mainReq = redRequests[0];
    const label =
      mainReq.type === 'time_off'
        ? `Time Off (${mainReq.status})`
        : `Unavailable (${mainReq.status})`;
    return { level: 'red', label, requests: matchingRequests };
  }

  const yellowRequests = matchingRequests.filter((ar) => {
    if (ar.type === 'time_off' && ar.status === 'pending') return true;
    if (ar.type === 'preferred') return true;
    return false;
  });

  if (yellowRequests.length > 0) {
    const mainReq = yellowRequests[0];
    const label =
      mainReq.type === 'time_off' ? 'Pending Time Off' : 'Preferred Hours';
    return { level: 'yellow', label, requests: matchingRequests };
  }

  return { level: 'green', label: 'Available', requests: matchingRequests };
}

const AvailabilityIndicator: React.FC<{
  info: AvailabilityInfo;
  workerName?: string;
  size?: 'sm' | 'md';
}> = ({ info, workerName, size = 'sm' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<'left' | 'right'>('right');

  useEffect(() => {
    if (showTooltip && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();

      if (rect.right + 260 > window.innerWidth) {
        setTooltipPos('left');
      } else {
        setTooltipPos('right');
      }
    }
  }, [showTooltip]);

  const dotSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const dotColor = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
  }[info.level];

  const ringColor = {
    green: 'ring-green-200',
    yellow: 'ring-yellow-200',
    red: 'ring-red-200',
  }[info.level];

  const pulseColor = {
    green: '',
    yellow: 'animate-pulse',
    red: 'animate-pulse',
  }[info.level];

  const formatDate = (d: string) => {
    try {
      return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const formatTime = (t: string) => {
    if (t === '00:00' || t === '23:59') return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const dh = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${dh}:${m} ${ampm}`;
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'time_off':
        return 'Time Off';
      case 'unavailable':
        return 'Unavailable';
      case 'preferred':
        return 'Preferred Hours';
      case 'available':
        return 'Available';
      default:
        return type;
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'time_off':
        return <XCircle size={12} className="text-red-500" />;
      case 'unavailable':
        return <AlertTriangle size={12} className="text-red-500" />;
      case 'preferred':
        return <Clock size={12} className="text-yellow-500" />;
      case 'available':
        return <CheckCircle size={12} className="text-green-500" />;
      default:
        return <HelpCircle size={12} className="text-gray-400" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="text-[9px] px-1 py-0 rounded bg-green-100 text-green-700 font-medium">
            Approved
          </span>
        );
      case 'pending':
        return (
          <span className="text-[9px] px-1 py-0 rounded bg-yellow-100 text-yellow-700 font-medium">
            Pending
          </span>
        );
      case 'denied':
        return (
          <span className="text-[9px] px-1 py-0 rounded bg-gray-100 text-gray-500 font-medium">
            Denied
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`${dotSize} rounded-full ${dotColor} ring-2 ${ringColor} ${pulseColor} flex-shrink-0 cursor-help`}
      />

      {showTooltip && (
        <div
          ref={tooltipRef}
          className={`absolute z-[100] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 min-w-[240px] max-w-[280px] ${
            tooltipPos === 'right' ? 'left-full ml-2' : 'right-full mr-2'
          } top-1/2 -translate-y-1/2`}
          style={{ pointerEvents: 'none' }}
        >
          {}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-gray-200 rotate-45 ${
              tooltipPos === 'right'
                ? '-left-1 border-l border-b'
                : '-right-1 border-r border-t'
            }`}
          />

          {}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
            <div
              className={`w-3 h-3 rounded-full ${dotColor} ring-2 ${ringColor}`}
            />
            <div>
              {workerName && (
                <p className="text-xs font-semibold text-gray-800">
                  {workerName}
                </p>
              )}
              <p
                className={`text-xs font-medium ${
                  info.level === 'green'
                    ? 'text-green-600'
                    : info.level === 'yellow'
                      ? 'text-yellow-600'
                      : 'text-red-600'
                }`}
              >
                {info.label}
              </p>
            </div>
          </div>

          {}
          {info.requests.length > 0 ? (
            <div className="space-y-2">
              {info.requests.map((req) => (
                <div key={req.id} className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {typeIcon(req.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-gray-800">
                        {typeLabel(req.type)}
                      </span>
                      {statusBadge(req.status)}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Calendar
                        size={10}
                        className="text-gray-400 flex-shrink-0"
                      />
                      <span className="text-[10px] text-gray-600">
                        {formatDate(req.date)}
                        {req.endDate &&
                          req.endDate !== req.date &&
                          ` - ${formatDate(req.endDate)}`}
                      </span>
                    </div>
                    {(formatTime(req.startTime) || formatTime(req.endTime)) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock
                          size={10}
                          className="text-gray-400 flex-shrink-0"
                        />
                        <span className="text-[10px] text-gray-600">
                          {formatTime(req.startTime)} -{' '}
                          {formatTime(req.endTime)}
                        </span>
                      </div>
                    )}
                    {req.reason && (
                      <p className="text-[10px] text-gray-500 mt-0.5 italic truncate">
                        {req.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              No availability restrictions
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AvailabilityIndicator;
