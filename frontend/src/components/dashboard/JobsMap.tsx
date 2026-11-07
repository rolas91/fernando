import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useAppContext } from '@/contexts/AppContext';
import {
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
} from 'lucide-react';
import { loadGoogleMapsPlaces } from '@/lib/loadGoogleMapsPlaces';
import { publicFileUrl } from '@/lib/publicFiles';
import type { Shift, WorkOrder } from '@/lib/types';
import {
  getShiftCardAccent,
  getShiftConfirmationSummary,
  getShiftHeadcountTextClass,
  getShiftMissingWorkerSlots,
} from '@/components/scheduler/shiftConfirmation';

const API_BASE = String(import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '');
const API_PREFIX = '/api';
const GOOGLE_MAPS_API_KEY = String(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
).trim();

function apiUrl(path: string) {
  return `${API_BASE}${API_PREFIX}${path}`;
}

interface GeocodedJob {
  id: string;
  name: string;
  location: string;
  city: string;
  clientName: string;
  lat: number | null;
  lng: number | null;
}

function markerSvg(selected: boolean) {
  const color = '#CC0000';
  const strokeWidth = selected ? 4 : 2;
  const svg = `
    <svg width="42" height="54" viewBox="0 0 42 54" xmlns="http://www.w3.org/2000/svg">
      <filter id="shadow" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.28"/>
      </filter>
      <path filter="url(#shadow)" d="M21 51C21 51 37 31.5 37 18.5C37 9.4 29.8 2 21 2C12.2 2 5 9.4 5 18.5C5 31.5 21 51 21 51Z" fill="${color}" stroke="#ffffff" stroke-width="${strokeWidth}"/>
      <circle cx="21" cy="18.5" r="9.5" fill="#ffffff" fill-opacity="0.96"/>
      <rect x="15.5" y="12.5" width="11" height="13" rx="1.8" fill="none" stroke="${color}" stroke-width="2"/>
      <path d="M18 16h6M18 19.2h6M18 22.4h4" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M18.2 10.8h5.6" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatShiftDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatShiftTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return time;
  const date = new Date();
  date.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shiftStatusMeta(shift: Shift) {
  const accent = getShiftCardAccent(shift);
  switch (accent) {
    case 'completed':
      return {
        label: 'Completed',
        badge: 'bg-gray-100 text-gray-700 border-gray-200',
      };
    case 'understaffed':
      return {
        label: 'Missing',
        badge: 'bg-orange-100 text-orange-800 border-orange-200',
      };
    case 'declined':
      return {
        label: 'Declined',
        badge: 'bg-red-100 text-red-800 border-red-200',
      };
    case 'confirmed':
      return {
        label: 'Confirmed',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'pending_confirmation':
      return {
        label: 'Pending',
        badge: 'bg-amber-100 text-amber-800 border-amber-200',
      };
  }
}

const ShiftStrip: React.FC<{ workOrder: WorkOrder | null }> = ({
  workOrder,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shifts = useMemo(
    () =>
      [...(workOrder?.shifts || [])].sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      ),
    [workOrder],
  );

  if (!workOrder || shifts.length === 0) {
    return (
      <div className="flex h-full min-h-[4.25rem] items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-xs text-gray-500">
        No shifts scheduled
      </div>
    );
  }

  const scroll = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(240, el.clientWidth * 0.92),
      behavior: 'smooth',
    });
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          Shifts ({shifts.length})
        </span>
        {shifts.length > 3 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scroll(-1)}
              className="rounded-md border border-gray-200 bg-white p-1 text-gray-500 hover:bg-gray-50"
              aria-label="Previous shifts"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              className="rounded-md border border-gray-200 bg-white p-1 text-gray-500 hover:bg-gray-50"
              aria-label="Next shifts"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {shifts.map((shift) => (
          <ShiftMiniCard key={shift.id} shift={shift} />
        ))}
      </div>
    </div>
  );
};

const ShiftMiniCard: React.FC<{ shift: Shift }> = ({ shift }) => {
  const summary = getShiftConfirmationSummary(shift);
  const totalAssigned = shift.roles.reduce(
    (sum, role) => sum + role.assignedWorkers.length,
    0,
  );
  const totalRequired = shift.roles.reduce(
    (sum, role) => sum + role.requiredCount,
    0,
  );
  const missing = getShiftMissingWorkerSlots(shift);
  const status = shiftStatusMeta(shift);
  const completed = false;
  const roleLabel =
    shift.roles.length > 0
      ? shift.roles
          .slice(0, 2)
          .map((role) => role.roleName)
          .join(', ')
      : 'No roles';

  return (
    <div className="min-w-[13.5rem] max-w-[16rem] flex-[0_0_82%] snap-start rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm sm:flex-[0_0_48%] md:flex-[0_0_31.8%]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-gray-900">
            {formatShiftDate(shift.date)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
            <Clock size={11} />
            {formatShiftTime(shift.startTime)} -{' '}
            {formatShiftTime(shift.endTime)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${status.badge}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className={`font-bold ${getShiftHeadcountTextClass(shift)}`}>
          {totalAssigned}/{totalRequired}
        </span>
        <span className="font-semibold text-emerald-700">
          {summary.confirmed}/{summary.assigned} confirmed
        </span>
        <span
          className={
            missing > 0 && !completed
              ? 'font-semibold text-orange-700'
              : 'font-semibold text-gray-500'
          }
        >
          {completed ? 0 : missing} missing
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-gray-500">
        <Users size={11} />
        {roleLabel}
        {shift.roles.length > 2 ? ` +${shift.roles.length - 2}` : ''}
      </p>
    </div>
  );
};

function createLogoMarkerOverlay({
  map,
  position,
  title,
  logoUrl,
  selected,
  onClick,
}: {
  map: google.maps.Map;
  position: google.maps.LatLngLiteral;
  title: string;
  logoUrl: string;
  selected: boolean;
  onClick: () => void;
}) {
  class LogoMarkerOverlay extends google.maps.OverlayView {
    private div: HTMLButtonElement | null = null;

    onAdd() {
      const size = selected ? 48 : 40;
      const imageSize = selected ? 32 : 28;
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.style.position = 'absolute';
      button.style.width = `${size}px`;
      button.style.height = `${Math.round(size * 1.28)}px`;
      button.style.padding = '0';
      button.style.border = '0';
      button.style.background = 'transparent';
      button.style.cursor = 'pointer';
      button.style.transform = 'translate(-50%, -100%)';
      button.style.zIndex = selected ? '20' : '10';
      button.style.filter = 'drop-shadow(0 3px 4px rgba(15, 23, 42, 0.28))';
      button.addEventListener('click', onClick);

      const pin = document.createElement('div');
      pin.style.position = 'absolute';
      pin.style.left = '50%';
      pin.style.top = '0';
      pin.style.width = `${size}px`;
      pin.style.height = `${size}px`;
      pin.style.borderRadius = '50% 50% 50% 0';
      pin.style.transform = 'translateX(-50%) rotate(-45deg)';
      pin.style.background = '#ffffff';
      pin.style.border = `${selected ? 4 : 3}px solid #CC0000`;
      pin.style.boxSizing = 'border-box';

      const imageWrap = document.createElement('div');
      imageWrap.style.position = 'absolute';
      imageWrap.style.left = '50%';
      imageWrap.style.top = '50%';
      imageWrap.style.width = `${Math.round(size * 0.82)}px`;
      imageWrap.style.height = `${Math.round(size * 0.82)}px`;
      imageWrap.style.borderRadius = '9999px';
      imageWrap.style.transform = 'translate(-50%, -50%) rotate(45deg)';
      imageWrap.style.background = '#ffffff';
      imageWrap.style.display = 'flex';
      imageWrap.style.alignItems = 'center';
      imageWrap.style.justifyContent = 'center';
      imageWrap.style.overflow = 'hidden';

      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = '';
      img.style.width = `${imageSize}px`;
      img.style.height = `${imageSize}px`;
      img.style.objectFit = 'contain';
      img.style.display = 'block';

      imageWrap.appendChild(img);
      pin.appendChild(imageWrap);
      button.appendChild(pin);
      this.div = button;
      this.getPanes()?.overlayMouseTarget.appendChild(button);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(position.lat, position.lng),
      );
      if (!point) return;
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
    }

    onRemove() {
      if (this.div) {
        this.div.removeEventListener('click', onClick);
        this.div.remove();
        this.div = null;
      }
    }
  }

  const overlay = new LogoMarkerOverlay();
  overlay.setMap(map);
  return overlay;
}

async function geocodeMissingInBrowser(jobs: GeocodedJob[]) {
  if (!GOOGLE_MAPS_API_KEY || !jobs.some((job) => !job.lat || !job.lng)) {
    return jobs;
  }
  try {
    await loadGoogleMapsPlaces(GOOGLE_MAPS_API_KEY);
    if (!window.google?.maps?.Geocoder) return jobs;
    const geocoder = new google.maps.Geocoder();
    const geocodeOne = (job: GeocodedJob) =>
      new Promise<GeocodedJob>((resolve) => {
        if (job.lat && job.lng) {
          resolve(job);
          return;
        }
        const address = [job.location, job.city].filter(Boolean).join(', ');
        if (!address) {
          resolve(job);
          return;
        }
        geocoder.geocode({ address }, (results, status) => {
          const loc = status === 'OK' ? results?.[0]?.geometry.location : null;
          resolve(loc ? { ...job, lat: loc.lat(), lng: loc.lng() } : job);
        });
      });
    return Promise.all(jobs.map(geocodeOne));
  } catch {
    return jobs;
  }
}

function JobsGoogleMap({
  jobs,
  selectedJob,
  markerLogoUrl,
  onSelect,
}: {
  jobs: GeocodedJob[];
  selectedJob: GeocodedJob | null;
  markerLogoUrl?: string;
  onSelect: (job: GeocodedJob) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Array<google.maps.Marker | google.maps.OverlayView>
  >([]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !jobs.length) return;
    let cancelled = false;

    loadGoogleMapsPlaces(GOOGLE_MAPS_API_KEY).then(() => {
      if (cancelled || !containerRef.current || !window.google?.maps) return;
      const bounds = new google.maps.LatLngBounds();
      const center = {
        lat: jobs[0].lat || 37.7749,
        lng: jobs[0].lng || -122.4194,
      };

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
      }

      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

      jobs.forEach((job) => {
        if (!job.lat || !job.lng || !mapRef.current) return;
        const position = { lat: job.lat, lng: job.lng };
        const selected = selectedJob?.id === job.id;
        const fallbackSize = selected ? 48 : 40;
        bounds.extend(position);
        const marker = markerLogoUrl
          ? createLogoMarkerOverlay({
              map: mapRef.current,
              position,
              title: job.name,
              logoUrl: markerLogoUrl,
              selected,
              onClick: () => onSelect(job),
            })
          : new google.maps.Marker({
              map: mapRef.current,
              position,
              title: job.name,
              zIndex: selected ? 20 : 10,
              icon: {
                url: markerSvg(selected),
                scaledSize: new google.maps.Size(
                  fallbackSize,
                  selected ? 62 : 52,
                ),
                anchor: new google.maps.Point(
                  fallbackSize / 2,
                  selected ? 60 : 50,
                ),
              },
            });
        if (!markerLogoUrl) {
          marker.addListener('click', () => onSelect(job));
        }
        markersRef.current.push(marker);
      });

      if (jobs.length === 1) {
        mapRef.current.setCenter(center);
        mapRef.current.setZoom(14);
      } else if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, 48);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [jobs, selectedJob?.id, markerLogoUrl, onSelect]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

const JobsMap: React.FC<{ workOrders: WorkOrder[] }> = ({ workOrders }) => {
  const { projects, settings, getClientById, setCurrentPage } = useAppContext();
  const [geocodedJobs, setGeocodedJobs] = useState<GeocodedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedJob, setSelectedJob] = useState<GeocodedJob | null>(null);
  const [mapError, setMapError] = useState(false);

  const activeJobs = useMemo(() => {
    return workOrders
      .map((wo) => {
        const project = projects.find((p) => p.id === wo.projectId);
        return {
          id: wo.id,
          name: wo.title || project?.name || wo.orderNumber || wo.id,
          location: wo.assignmentAddress || project?.location || '',
          city: wo.assignmentCity || project?.city || '',
          clientName: project
            ? getClientById(project.clientId)?.name || 'Unknown'
            : 'Unknown',
        };
      })
      .filter((job) => job.location || job.city);
  }, [workOrders, projects, getClientById]);

  const geocodeJobs = useCallback(async () => {
    setLoading(true);
    setMapError(false);

    try {
      const locations = activeJobs;

      const response = await fetch(apiUrl('/integrations/geocode-jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
      });
      const data = await response.json();

      if (data?.success && data.locations) {
        const nextJobs = await geocodeMissingInBrowser(data.locations);
        setGeocodedJobs(nextJobs);
        setMapError(!nextJobs.some((job) => job.lat && job.lng));
      } else {
        const nextJobs = await geocodeMissingInBrowser(
          locations.map((l) => ({ ...l, lat: null, lng: null })),
        );
        setGeocodedJobs(nextJobs);
        setMapError(!nextJobs.some((job) => job.lat && job.lng));
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
      const nextJobs = await geocodeMissingInBrowser(
        activeJobs.map((job) => ({ ...job, lat: null, lng: null })),
      );
      setGeocodedJobs(nextJobs);
      setMapError(!nextJobs.some((job) => job.lat && job.lng));
    } finally {
      setLoading(false);
    }
  }, [activeJobs]);

  useEffect(() => {
    geocodeJobs();
  }, [geocodeJobs]);

  const jobsWithCoords = useMemo(
    () => geocodedJobs.filter((job) => job.lat && job.lng),
    [geocodedJobs],
  );
  const markerLogoUrl = useMemo(() => {
    const logo = settings.logo?.trim();
    return logo ? publicFileUrl(logo) : '';
  }, [settings.logo]);
  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === selectedJob?.id) || null,
    [workOrders, selectedJob?.id],
  );

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-[60] bg-black/30"
          onClick={() => setExpanded(false)}
        />
      )}
      <div
        className={`min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden transition-all ${expanded ? 'fixed inset-2 sm:inset-4 z-[61] flex flex-col shadow-2xl' : ''}`}
      >
        <div className="p-3 sm:p-4 shrink-0 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-800">
              Today's Job Locations
            </h2>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {activeJobs.length} jobs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={geocodeJobs}
              disabled={loading}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh map"
            >
              <RefreshCw
                size={14}
                className={`text-gray-400 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title={expanded ? 'Minimize' : 'Expand'}
            >
              {expanded ? (
                <Minimize2 size={14} className="text-gray-400" />
              ) : (
                <Maximize2 size={14} className="text-gray-400" />
              )}
            </button>
          </div>
        </div>

        <div
          className={`relative ${expanded ? 'min-h-0 flex-1' : 'h-[min(65dvh,420px)] min-h-64 sm:h-[360px]'}`}
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <Loader2
                  size={24}
                  className="animate-spin text-primary mx-auto mb-2"
                />
                <p className="text-sm text-gray-500">
                  Loading job locations...
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="absolute inset-0 overflow-hidden bg-slate-100">
                {jobsWithCoords.length > 0 && GOOGLE_MAPS_API_KEY ? (
                  <JobsGoogleMap
                    jobs={jobsWithCoords}
                    selectedJob={selectedJob}
                    markerLogoUrl={markerLogoUrl}
                    onSelect={(job) => {
                      setSelectedJob(selectedJob?.id === job.id ? null : job);
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(30deg,#edf7ff_0%,#ecfdf5_50%,#f8fafc_100%)]">
                    <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(#94a3b8_1px,transparent_1px),linear-gradient(90deg,#94a3b8_1px,transparent_1px)] [background-size:48px_48px]" />
                    <div className="absolute left-[-10%] top-[18%] h-8 w-[120%] rotate-[-8deg] rounded-full bg-white/80 shadow-sm" />
                    <div className="absolute left-[-10%] top-[58%] h-10 w-[120%] rotate-[5deg] rounded-full bg-white/80 shadow-sm" />
                    <div className="absolute left-[18%] top-[-10%] h-[120%] w-8 rotate-[10deg] rounded-full bg-white/70 shadow-sm" />
                    <div className="absolute right-[22%] top-[-10%] h-[120%] w-8 rotate-[-7deg] rounded-full bg-white/70 shadow-sm" />
                    <div className="absolute left-[24%] top-[24%] rounded-md bg-emerald-200/50 px-3 py-1 text-[10px] font-semibold text-emerald-800">
                      Job area
                    </div>
                    <div className="absolute right-[20%] bottom-[28%] rounded-md bg-blue-200/50 px-3 py-1 text-[10px] font-semibold text-blue-800">
                      Route
                    </div>
                  </div>
                )}

                {}
                {geocodedJobs.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3 text-center shadow-sm">
                      <MapPin
                        size={20}
                        className="mx-auto mb-1 text-gray-400"
                      />
                      <p className="text-sm font-medium text-gray-700">
                        No active job locations
                      </p>
                      <p className="text-xs text-gray-500">
                        Add an assignment address to show it here.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {}
              {selectedJob && (
                <div className="absolute bottom-2 left-2 right-2 max-h-[65%] overflow-y-auto sm:bottom-3 sm:left-3 sm:right-3 z-20 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 lg:basis-64 lg:shrink-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-gray-800">
                          {selectedJob.name}
                        </h3>
                      </div>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
                        <MapPin size={10} />
                        {selectedJob.location}
                        {selectedJob.city ? `, ${selectedJob.city}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        Client: {selectedJob.clientName}
                      </p>
                    </div>
                    <ShiftStrip workOrder={selectedWorkOrder} />
                    <div className="flex shrink-0 items-center gap-1 self-start lg:self-center">
                      <button
                        onClick={() => {
                          setCurrentPage('workorders');
                          setSelectedJob(null);
                        }}
                        className="p-1.5 hover:bg-primary/10 rounded text-primary"
                        title="View assignments"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        onClick={() => setSelectedJob(null)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-400"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {}
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 p-2.5 z-20">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-gray-600">In Progress</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-xs text-gray-600">Confirmed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="text-xs text-gray-600">Pending</span>
                  </div>
                </div>
              </div>

              {mapError && (
                <div className="absolute top-3 left-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 z-20">
                  <p className="text-xs text-yellow-700">
                    Map data loading in visual mode
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {}
        {expanded && (
          <div className="shrink-0 border-t border-gray-200 p-3 sm:p-4 max-h-[20dvh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {geocodedJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left hover:bg-gray-50 transition-colors ${selectedJob?.id === job.id ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'}`}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0 bg-red-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {job.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{job.city}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default JobsMap;
