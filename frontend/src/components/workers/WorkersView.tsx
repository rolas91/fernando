import DataPagination from '@/components/shared/DataPagination';
import { useQuery } from '@tanstack/react-query';
import { dbFetchWorker } from '@/lib/db';
import { appDataKey } from '@/lib/appDataQueries';
import { usePagedCatalog } from '@/hooks/use-paged-catalog';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext, AppContextOverride } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_ASSIGNMENT_COUNTRY } from '@/lib/googlePlaceAddress';
import {
  formatUsPhoneInput,
  HOURLY_RATE_MAX,
  HOURLY_RATE_MIN,
  licenseExpiresSoonWarning,
  localTodayISO,
  sanitizeDriverLicense,
  validateWorkerModalForm,
} from '@/lib/workerFormValidation';
import PlacesStructuredAddressField from '@/components/shared/PlacesStructuredAddressField';
import WorkerFileUploadsField from './WorkerFileUploadsField';
import CatalogImportButton from '@/components/catalog-import/CatalogImportButton';
import { SkillMultiSelect } from '@/components/skills/SkillMultiSelect';
import { UserRole, WorkerRole, Worker } from '@/lib/types';
import {
  Archive,
  Check,
  ChevronsUpDown,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Shield,
  X,
} from 'lucide-react';

type CertificationAssignmentForm = {
  certificationId: string;
  expirationDate: string;
};

const API_USERS_BASE = `${import.meta.env.VITE_API_URL || ''}/api`;

const escapeCsvValue = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

async function fetchUserEmailsLowerSet(): Promise<Set<string>> {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const res = await fetch(`${API_USERS_BASE}/users`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) return new Set<string>();
  const data = (await res.json()) as Array<{ email?: string }>;
  return new Set(
    data.map((u) => (u.email ?? '').trim().toLowerCase()).filter(Boolean),
  );
}

const WorkersView: React.FC = () => {
  const { settings, workerRoles } = useAppContext();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const catalog = usePagedCatalog<Worker>('workers', {
    search,
    status: statusFilter,
    type: typeFilter,
  });
  const workers = catalog.rows;
  const { updateWorker } = catalog.overrides;
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const { user } = useAuth();
  const focusedId = editingWorker || selectedWorker;
  const focusedRecord = useQuery({
    queryKey: [
      ...appDataKey(user?.id || 'guest', 'workers'),
      'record',
      focusedId,
    ],
    queryFn: ({ signal }) => dbFetchWorker(focusedId!, signal),
    enabled: Boolean(user && focusedId),
    initialData: () => workers.find((worker) => worker.id === focusedId),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const dialogWorkers =
    focusedRecord.data &&
    !workers.some((worker) => worker.id === focusedRecord.data.id)
      ? [...workers, focusedRecord.data]
      : workers;

  const filtered = workers;

  const handleExport = async () => {
    const records = await catalog.exportAll();
    if (!records) return;
    const rows = [
      [
        'id',
        'firstName',
        'lastName',
        'email',
        'phone',
        'driverLicense',
        'driverLicenseExpiration',
        'primaryAddress',
        'city',
        'zipCode',
        'state',
        'country',
        'latitude',
        'longitude',
        'type',
        'role',
        'status',
        'hireDate',
        'hourlyRate',
        'emergencyContact',
        'notes',
        'skills',
        'workerRoles',
        'certifications',
      ],
      ...records.map((worker) => {
        return [
          worker.id,
          worker.firstName,
          worker.lastName,
          worker.email,
          worker.phone,
          worker.driverLicense,
          worker.driverLicenseExpiration,
          worker.primaryAddress,
          worker.city,
          worker.zipCode,
          worker.state,
          worker.country,
          worker.latitude,
          worker.longitude,
          worker.type,
          worker.role,
          worker.status,
          worker.hireDate,
          worker.hourlyRate,
          worker.emergencyContact,
          worker.notes,
          (worker.skills || []).map((skill) => skill.name).join(', '),
          (worker.workerRoles || []).map((role) => role.name).join(', '),
          (worker.certifications || [])
            .map((certification) => certification.name)
            .join(', '),
        ];
      }),
    ];
    const csv = `\uFEFF${rows
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\r\n')}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'workers.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppContextOverride
      value={{ ...catalog.overrides, workers: dialogWorkers }}
    >
      <div className="p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Workforce Management
            </h2>
            <p className="text-sm text-gray-500">
              {catalog.meta?.total ?? '—'} workers found
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={catalog.exporting || catalog.query.isPending}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={14} /> Export
            </button>
            <CatalogImportButton
              scope="workers"
              label="Import Excel"
              onDone={() => void catalog.refresh()}
            />
            <button
              disabled={!catalog.query.data}
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
            >
              <Plus size={14} /> Add Worker
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded px-3 py-1.5 basis-48 flex-1 max-w-sm">
            <Search size={14} className="text-gray-400 mr-2" />
            <input
              placeholder="Search workers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Types / Roles</option>
            {settings.workerTypes.map((workerType) => (
              <option key={workerType} value={workerType}>
                {workerType}
              </option>
            ))}
            {workerRoles.map((role) => (
              <option key={role.id} value={role.name}>
                {role.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <CatalogQueryState
          loading={catalog.query.isPending}
          error={catalog.query.error}
          retry={() => void catalog.query.refetch()}
        />
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Worker
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Roles
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Contact
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Rate
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Certifications
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Skills
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((worker) => (
                  <tr
                    key={worker.id}
                    className="border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                          {worker.firstName[0]}
                          {worker.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {worker.firstName} {worker.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            Since{' '}
                            {new Date(worker.hireDate).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                year: 'numeric',
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {worker.type || ''}
                    </td>
                    <td className="px-4 py-3">
                      {(worker.workerRoles || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(worker.workerRoles || [])
                            .slice(0, 3)
                            .map((role) => (
                              <span
                                key={role.id}
                                className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                              >
                                {role.name}
                              </span>
                            ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{worker.email}</p>
                      <p className="text-xs text-gray-500">{worker.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      ${worker.hourlyRate}/hr
                    </td>
                    <td className="px-4 py-3">
                      {worker.certifications.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {worker.certifications
                            .slice(0, 3)
                            .map((certification) => (
                              <div
                                key={certification.id}
                                className="inline-flex flex-col rounded-xl bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                              >
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Shield size={11} />
                                  {certification.name}
                                </span>
                                {certification.expirationDate ? (
                                  <span className="mt-0.5 text-[11px] text-blue-600/80">
                                    Expires {certification.expirationDate}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          {worker.certifications.length > 3 ? (
                            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                              +{worker.certifications.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {worker.skills.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {worker.skills.slice(0, 3).map((skill) => (
                            <span
                              key={skill.id}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium"
                            >
                              <Sparkles size={11} />
                              {skill.name}
                            </span>
                          ))}
                          {worker.skills.length > 3 ? (
                            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                              +{worker.skills.length - 3}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                          worker.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : worker.status === 'inactive'
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedWorker(worker.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="View"
                        >
                          <Eye size={14} className="text-gray-400" />
                        </button>
                        <button
                          onClick={() => setEditingWorker(worker.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Edit"
                        >
                          <Edit2 size={14} className="text-gray-400" />
                        </button>
                        <button
                          onClick={() =>
                            updateWorker(worker.id, {
                              status:
                                worker.status === 'archived'
                                  ? 'active'
                                  : 'archived',
                            }).catch(catalog.reportError)
                          }
                          className="p-1 hover:bg-gray-100 rounded"
                          title="Archive"
                        >
                          <Archive size={14} className="text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal || editingWorker ? (
          <WorkerModal
            key={editingWorker ?? '__add_worker__'}
            workerId={editingWorker}
            onClose={() => {
              setShowAddModal(false);
              setEditingWorker(null);
            }}
          />
        ) : null}

        {selectedWorker ? (
          <WorkerDetail
            workerId={selectedWorker}
            onClose={() => setSelectedWorker(null)}
          />
        ) : null}
        <DataPagination page={catalog.page} total={(catalog.meta)?.total} pageSize={catalog.pageSize} onPage={catalog.setPage} onPageSize={catalog.setPageSize} busy={catalog.query.isFetching} />
      </div>
    </AppContextOverride>
  );
};

const WorkerModal: React.FC<{
  workerId: string | null;
  onClose: () => void;
}> = ({ workerId, onClose }) => {
  const {
    workers,
    settings,
    certifications,
    skills,
    workerRoles,
    addWorker,
    updateWorker,
  } = useAppContext();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('admin');
  const existing = workerId
    ? workers.find((worker) => worker.id === workerId)
    : null;
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: existing?.firstName || '',
    lastName: existing?.lastName || '',
    email: existing?.email || '',
    phone: existing?.phone ? formatUsPhoneInput(existing.phone) : '',
    driverLicense: existing?.driverLicense
      ? sanitizeDriverLicense(existing.driverLicense)
      : '',
    driverLicenseExpiration:
      typeof existing?.driverLicenseExpiration === 'string'
        ? existing.driverLicenseExpiration.slice(0, 10)
        : '',
    primaryAddress: existing?.primaryAddress || '',
    city: existing?.city || '',
    zipCode: existing?.zipCode || '',
    state: existing?.state || '',
    country: existing?.country || DEFAULT_ASSIGNMENT_COUNTRY,
    latitude:
      existing?.latitude !== undefined && existing?.latitude !== null
        ? Number(existing.latitude)
        : null,
    longitude:
      existing?.longitude !== undefined && existing?.longitude !== null
        ? Number(existing.longitude)
        : null,
    type: existing?.type || settings.workerTypes[0],
    role: existing?.role || settings.workerTypes[0],
    hourlyRate: existing?.hourlyRate ?? 30,
    hireDate:
      typeof existing?.hireDate === 'string' && existing.hireDate
        ? existing.hireDate.slice(0, 10)
        : localTodayISO(),
    notes: existing?.notes || '',
    fileUploads: existing?.fileUploads || [],
  });
  const isAddMode = !workerId;
  const [userEmailLookup, setUserEmailLookup] = useState<Set<string> | null>(
    null,
  );
  const [createAppUser, setCreateAppUser] = useState(false);
  const [appUserPassword, setAppUserPassword] = useState('');
  const [appUserRole, setAppUserRole] = useState<UserRole>('viewer');

  const [certificationAssignments, setCertificationAssignments] = useState<
    CertificationAssignmentForm[]
  >(
    existing?.certificationAssignments?.map((assignment) => ({
      certificationId: assignment.certificationId,
      expirationDate: assignment.expirationDate || '',
    })) ||
      existing?.certifications.map((certification) => ({
        certificationId: certification.id,
        expirationDate: certification.expirationDate || '',
      })) ||
      [],
  );
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(
    existing?.skillIds || existing?.skills.map((skill) => skill.id) || [],
  );
  const [selectedWorkerRoleIds, setSelectedWorkerRoleIds] = useState<string[]>(
    existing?.workerRoleIds ||
      existing?.workerRoles?.map((role) => role.id) ||
      [],
  );

  const todayIso = localTodayISO();

  useEffect(() => {
    if (!isAdmin) {
      setUserEmailLookup(null);
      return;
    }
    let cancelled = false;
    fetchUserEmailsLowerSet()
      .then((set) => {
        if (!cancelled) setUserEmailLookup(set);
      })
      .catch(() => {
        if (!cancelled) setUserEmailLookup(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const workerEmailLower = form.email.trim().toLowerCase();
  const existingLoginForEmail =
    userEmailLookup && userEmailLookup.has(workerEmailLower);

  useEffect(() => {
    if (userEmailLookup && existingLoginForEmail && createAppUser) {
      setCreateAppUser(false);
      setAppUserPassword('');
    }
  }, [userEmailLookup, existingLoginForEmail, createAppUser]);

  const licenseExpiresWithin30Days = useMemo(
    () =>
      form.driverLicenseExpiration
        ? licenseExpiresSoonWarning(form.driverLicenseExpiration, 30)
        : null,
    [form.driverLicenseExpiration],
  );

  const selectedCertificationIds = useMemo(
    () =>
      certificationAssignments.map((assignment) => assignment.certificationId),
    [certificationAssignments],
  );

  const selectedCertifications = useMemo(
    () =>
      certifications.filter((certification) =>
        selectedCertificationIds.includes(certification.id),
      ),
    [certifications, selectedCertificationIds],
  );

  const selectedCertificationEntries = useMemo(
    () =>
      certificationAssignments
        .map((assignment) => ({
          assignment,
          certification: certifications.find(
            (certification) => certification.id === assignment.certificationId,
          ),
        }))
        .filter(
          (
            entry,
          ): entry is {
            assignment: CertificationAssignmentForm;
            certification: (typeof certifications)[number];
          } => Boolean(entry.certification),
        ),
    [certificationAssignments, certifications],
  );

  const handleCertificationSelectionChange = (ids: string[]) => {
    setCertificationAssignments((current) =>
      ids.map((id) => {
        const existingAssignment = current.find(
          (assignment) => assignment.certificationId === id,
        );
        return (
          existingAssignment || {
            certificationId: id,
            expirationDate: '',
          }
        );
      }),
    );
  };

  const updateCertificationExpiration = (
    certificationId: string,
    expirationDate: string,
  ) => {
    setCertificationAssignments((current) =>
      current.map((assignment) =>
        assignment.certificationId === certificationId
          ? { ...assignment, expirationDate }
          : assignment,
      ),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const clientMsg = validateWorkerModalForm({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      type: form.type,
      hourlyRate: form.hourlyRate,
      driverLicense: form.driverLicense,
      driverLicenseExpiration: form.driverLicenseExpiration,
      hireDate: form.hireDate,
    });
    if (clientMsg) {
      setError(clientMsg);
      return;
    }
    if (isAdmin && createAppUser) {
      if (!isAddMode && existingLoginForEmail) {
        setError(
          'This email address already has a user account on the platform; another one cannot be created.',
        );
        return;
      }
      if (!appUserPassword || appUserPassword.length < 6) {
        setError('App login password must be at least 6 characters.');
        return;
      }
    }

    const hourlyRateClamped = Math.min(
      HOURLY_RATE_MAX,
      Math.max(HOURLY_RATE_MIN, Number(form.hourlyRate) || 0),
    );
    const driverLicenseClean = sanitizeDriverLicense(form.driverLicense);

    const payload = {
      ...form,
      driverLicense: driverLicenseClean,
      hourlyRate: hourlyRateClamped,
      certificationIds: selectedCertificationIds,
      certificationAssignments: certificationAssignments.map((assignment) => ({
        certificationId: assignment.certificationId,
        expirationDate: assignment.expirationDate || undefined,
      })),
      certifications: selectedCertifications,
      skillIds: selectedSkillIds,
      skills: skills.filter((skill) => selectedSkillIds.includes(skill.id)),
      workerRoleIds: selectedWorkerRoleIds,
      workerRoles: workerRoles.filter((role) =>
        selectedWorkerRoleIds.includes(role.id),
      ),
    };

    try {
      if (workerId && existing) {
        await updateWorker(workerId, {
          ...payload,
          ...(isAdmin &&
          createAppUser &&
          !(userEmailLookup && userEmailLookup.has(workerEmailLower))
            ? {
                createAppUser: true,
                appUserPassword,
                appUserRole,
              }
            : {}),
        });
      } else {
        await addWorker({
          id: `w_${Date.now()}`,
          ...payload,
          status: 'active',
          ...(isAdmin && isAddMode && createAppUser
            ? {
                createAppUser: true,
                appUserPassword,
                appUserRole,
              }
            : {}),
        });
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save worker to server',
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[90dvh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {workerId ? 'Edit Worker' : 'Add Worker'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                required
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                required
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(415) 555-5555"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: formatUsPhoneInput(event.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                US numbers only (10 digits); formatted automatically as you
                type.
              </p>
            </div>
          </div>

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Driver License
              </label>
              <input
                value={form.driverLicense}
                maxLength={24}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    driverLicense: sanitizeDriverLicense(event.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                License expires
              </label>
              <input
                type="date"
                min={todayIso}
                value={form.driverLicenseExpiration || ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    driverLicenseExpiration: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          {licenseExpiresWithin30Days ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {licenseExpiresWithin30Days}
            </div>
          ) : null}

          <PlacesStructuredAddressField
            id={`worker-primary-address-${workerId ?? 'new'}`}
            label="Primary Address"
            hideCoordinates
            value={{
              addressLine: form.primaryAddress,
              latitude: form.latitude ?? null,
              longitude: form.longitude ?? null,
              city: form.city,
              state: form.state,
              zipCode: form.zipCode,
              country: form.country || DEFAULT_ASSIGNMENT_COUNTRY,
            }}
            onChange={(next) =>
              setForm((current) => ({
                ...current,
                primaryAddress: next.addressLine,
                latitude: next.latitude,
                longitude: next.longitude,
                city: next.city,
                state: next.state,
                zipCode: next.zipCode,
                country: next.country || DEFAULT_ASSIGNMENT_COUNTRY,
              }))
            }
          />

          <div className="responsive-grid grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type *
              </label>
              <select
                required
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                    role: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {settings.workerTypes.map((workerType) => (
                  <option key={workerType} value={workerType}>
                    {workerType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate ($) *
              </label>
              <input
                type="number"
                min={HOURLY_RATE_MIN}
                max={HOURLY_RATE_MAX}
                step={0.5}
                required
                value={form.hourlyRate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    hourlyRate: (() => {
                      const v = parseFloat(event.target.value);
                      if (!Number.isFinite(v)) return 0;
                      return Math.min(
                        HOURLY_RATE_MAX,
                        Math.max(HOURLY_RATE_MIN, v),
                      );
                    })(),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Entre ${HOURLY_RATE_MIN} y ${HOURLY_RATE_MAX}/h.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Worker Roles
            </label>
            <WorkerRoleMultiSelect
              workerRoles={workerRoles}
              selectedIds={selectedWorkerRoleIds}
              onChange={setSelectedWorkerRoleIds}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Assignment roles match against these operational worker roles.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Skills
            </label>
            <SkillMultiSelect
              skills={skills}
              selectedIds={selectedSkillIds}
              onChange={setSelectedSkillIds}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hire Date
            </label>
            <input
              type="date"
              max={todayIso}
              value={form.hireDate}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  hireDate: event.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Certifications
            </label>
            <CertificationMultiSelect
              certifications={certifications}
              selectedIds={selectedCertificationIds}
              onChange={handleCertificationSelectionChange}
            />
            {selectedCertificationEntries.length > 0 ? (
              <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                {selectedCertificationEntries.map(
                  ({ assignment, certification }) => (
                    <div
                      key={certification.id}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                            <Shield size={11} />
                            {certification.name}
                          </span>
                          {certification.description ? (
                            <p className="mt-2 text-xs text-gray-500">
                              {certification.description}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCertificationSelectionChange(
                              selectedCertificationIds.filter(
                                (id) => id !== certification.id,
                              ),
                            )
                          }
                          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label={`Remove ${certification.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
                        <p className="text-xs leading-5 text-gray-500">
                          Track the expiration date for this certification on
                          this specific worker.
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Expiration Date
                          </label>
                          <input
                            type="date"
                            value={assignment.expirationDate}
                            onChange={(event) =>
                              updateCertificationExpiration(
                                certification.id,
                                event.target.value,
                              )
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>

          <WorkerFileUploadsField
            value={form.fileUploads}
            onChange={(urls) =>
              setForm((current) => ({ ...current, fileUploads: urls }))
            }
            workerId={workerId || undefined}
          />

          {isAdmin && isAddMode ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAppUser}
                  onChange={(event) => {
                    setCreateAppUser(event.target.checked);
                    if (!event.target.checked) setAppUserPassword('');
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-800">
                  <span className="font-medium">Create app user</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Also create a login for the web app using the email above.
                    First and last name will match this worker.
                  </span>
                </span>
              </label>
              {createAppUser ? (
                <div className="space-y-3 pl-7 border-l-2 border-gray-200 ml-1">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      App role *
                    </label>
                    <select
                      value={appUserRole}
                      onChange={(event) =>
                        setAppUserRole(event.target.value as UserRole)
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="admin">Admin — Full access</option>
                      <option value="manager">Manager — Edit all data</option>
                      <option value="scheduler">
                        Schedule — Schedules & assignments
                      </option>
                      <option value="viewer">Viewer — Read-only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Temporary password *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={appUserPassword}
                      onChange={(event) =>
                        setAppUserPassword(event.target.value)
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="At least 6 characters"
                      minLength={6}
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Share this password securely; the user can change it from
                      their profile.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAdmin && !isAddMode ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
              {userEmailLookup === null ? (
                <p className="text-sm text-gray-600">
                  Checking if this email already has access to the platform…
                </p>
              ) : existingLoginForEmail ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  This email address already has a platform user account. You
                  can change the worker's information without affecting the
                  login.
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createAppUser}
                      onChange={(event) => {
                        setCreateAppUser(event.target.checked);
                        if (!event.target.checked) setAppUserPassword('');
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-800">
                      <span className="font-medium">Grant platform login</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {
                          "Create an app user linked to this worker (with the worker's name and email)."
                        }
                      </span>
                    </span>
                  </label>
                  {createAppUser ? (
                    <div className="space-y-3 pl-7 border-l-2 border-gray-200 ml-1">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          App role *
                        </label>
                        <select
                          value={appUserRole}
                          onChange={(event) =>
                            setAppUserRole(event.target.value as UserRole)
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="admin">Admin — Full access</option>
                          <option value="manager">
                            Manager — Edit all data
                          </option>
                          <option value="scheduler">
                            Schedule — Schedules & assignments
                          </option>
                          <option value="viewer">Viewer — Read-only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Temporary password *
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={appUserPassword}
                          onChange={(event) =>
                            setAppUserPassword(event.target.value)
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          placeholder="At least 6 characters"
                          minLength={6}
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          {
                            'Share the password securely; the user can change it from their profile.'
                          }
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              {workerId ? 'Save Changes' : 'Add Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const WorkerDetail: React.FC<{ workerId: string; onClose: () => void }> = ({
  workerId,
  onClose,
}) => {
  const { workers } = useAppContext();
  const worker = workers.find((item) => item.id === workerId);
  if (!worker) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Worker Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">
              {worker.firstName[0]}
              {worker.lastName[0]}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-800">
                {worker.firstName} {worker.lastName}
              </p>
              <p className="text-sm text-gray-500">{worker.type}</p>
            </div>
          </div>

          <div className="responsive-grid grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Email:</span>
              <p className="font-medium">{worker.email}</p>
            </div>
            <div>
              <span className="text-gray-500">Phone:</span>
              <p className="font-medium">{worker.phone}</p>
            </div>
            <div>
              <span className="text-gray-500">Driver License:</span>
              <p className="font-medium">{worker.driverLicense || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">License expires:</span>
              <p className="font-medium">
                {worker.driverLicenseExpiration
                  ? String(worker.driverLicenseExpiration).slice(0, 10)
                  : '—'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">State:</span>
              <p className="font-medium">{worker.state || '—'}</p>
            </div>
            <div>
              <span className="text-gray-500">Rate:</span>
              <p className="font-medium">${worker.hourlyRate}/hr</p>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <p className="font-medium capitalize">{worker.status}</p>
            </div>
            <div>
              <span className="text-gray-500">Hire Date:</span>
              <p className="font-medium">{worker.hireDate}</p>
            </div>
            <div>
              <span className="text-gray-500">Zip Code:</span>
              <p className="font-medium">{worker.zipCode || '—'}</p>
            </div>
          </div>

          <div className="text-sm">
            <span className="text-gray-500">Primary Address:</span>
            <p className="font-medium text-gray-800">
              {worker.primaryAddress || '—'}
            </p>
            <p className="text-gray-600">
              {[worker.city, worker.state, worker.zipCode]
                .filter(Boolean)
                .join(', ') || '—'}
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Worker Roles</h3>
            {(worker.workerRoles || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(worker.workerRoles || []).map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium"
                  >
                    {role.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No worker roles assigned</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">File Uploads</h3>
            {worker.fileUploads.length > 0 ? (
              <div className="space-y-2">
                {worker.fileUploads.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex-wrap gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip
                        size={14}
                        className="flex-shrink-0 text-gray-400"
                      />
                      <span className="truncate">
                        {url.split('/').pop() || 'File'}
                      </span>
                    </span>
                    <ExternalLink
                      size={14}
                      className="flex-shrink-0 text-gray-400"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No files on file</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Certifications</h3>
            {worker.certifications.length > 0 ? (
              <div className="space-y-2">
                {worker.certifications.map((certification) => (
                  <div
                    key={certification.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      <Shield size={12} />
                      {certification.name}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Expiration Date: {certification.expirationDate || '—'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No certifications on file</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Skills</h3>
            {worker.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {worker.skills.map((skill) => (
                  <span
                    key={skill.id}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-xs font-medium"
                  >
                    <Sparkles size={11} />
                    {skill.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No skills on file</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CertificationMultiSelect: React.FC<{
  certifications: Array<{
    id: string;
    name: string;
    description?: string;
    status: 'active' | 'inactive';
  }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ certifications, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeCertifications = useMemo(
    () =>
      certifications.filter(
        (certification) => certification.status === 'active',
      ),
    [certifications],
  );

  const selectedCertifications = useMemo(
    () =>
      certifications.filter((certification) =>
        selectedIds.includes(certification.id),
      ),
    [certifications, selectedIds],
  );

  const filteredCertifications = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeCertifications;
    return activeCertifications.filter((certification) => {
      const haystack =
        `${certification.name} ${certification.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeCertifications, search]);

  const toggleCertification = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-3 flex-wrap gap-3"
      >
        <div className="flex flex-wrap gap-1.5 min-h-5">
          {selectedCertifications.length > 0 ? (
            selectedCertifications.map((certification) => (
              <span
                key={certification.id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium"
              >
                <Shield size={11} />
                {certification.name}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCertification(certification.id);
                  }}
                  className="text-blue-500 hover:text-blue-700"
                >
                  <X size={11} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-gray-400">Select certifications...</span>
          )}
        </div>
        <ChevronsUpDown size={16} className="text-gray-400 flex-shrink-0" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="p-3 border-b border-gray-100">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search certifications..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {filteredCertifications.length > 0 ? (
              filteredCertifications.map((certification) => {
                const selected = selectedIds.includes(certification.id);
                return (
                  <button
                    key={certification.id}
                    type="button"
                    onClick={() => toggleCertification(certification.id)}
                    className={`w-full flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 ${
                      selected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {certification.name}
                      </p>
                      {certification.description ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {certification.description}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 text-transparent'
                      }`}
                    >
                      <Check size={12} />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-gray-500">
                No active certifications found.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const WorkerRoleMultiSelect: React.FC<{
  workerRoles: WorkerRole[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ workerRoles, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeRoles = useMemo(
    () => workerRoles.filter((role) => role.status === 'active'),
    [workerRoles],
  );
  const selectedRoles = useMemo(
    () => workerRoles.filter((role) => selectedIds.includes(role.id)),
    [workerRoles, selectedIds],
  );
  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeRoles;
    return activeRoles.filter((role) =>
      `${role.name} ${role.description || ''}`.toLowerCase().includes(query),
    );
  }, [activeRoles, search]);

  const toggleRole = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-3 flex-wrap gap-3"
      >
        <div className="flex flex-wrap gap-1.5 min-h-5">
          {selectedRoles.length > 0 ? (
            selectedRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium"
              >
                {role.name}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleRole(role.id);
                  }}
                  className="text-blue-500 hover:text-blue-700"
                >
                  <X size={11} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-gray-400">Select worker roles...</span>
          )}
        </div>
        <ChevronsUpDown size={16} className="text-gray-400 flex-shrink-0" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="p-3 border-b border-gray-100">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search worker roles..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {filteredRoles.length > 0 ? (
              filteredRoles.map((role) => {
                const selected = selectedIds.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`w-full flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 ${
                      selected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {role.name}
                      </p>
                      {role.description ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {role.description}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 text-transparent'
                      }`}
                    >
                      <Check size={12} />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-gray-500">
                No active worker roles found.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WorkersView;
