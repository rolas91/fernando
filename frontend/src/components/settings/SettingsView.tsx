import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { CompanySettings, FormField, FormTemplate } from '@/lib/types';
import {
  dbUploadLogo,
  dbUploadLogoIcon,
  dbPreviewNextWorkOrderNumber,
  dbPreviewWorkOrderPdfBuilder,
} from '@/lib/db';
import CertificationsView from '@/components/certifications/CertificationsView';
import ProjectTypesView from '@/components/project-types/ProjectTypesView';
import SkillsView from '@/components/skills/SkillsView';
import WorkerRolesView from '@/components/worker-roles/WorkerRolesView';
import WorkOrderTypesView from '@/components/work-order-types/WorkOrderTypesView';
import StatusCatalogView from '@/components/status-catalog/StatusCatalogView';
import ShiftTypesView from '@/components/shift-types/ShiftTypesView';
import {
  Building2,
  Clock,
  Users,
  Truck,
  Plus,
  X,
  Save,
  Edit2,
  Trash2,
  ListChecks,
  Shield,
  Sparkles,
  Package,
  UserCog,
  Upload,
  FileOutput,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import UserManagementView from '@/components/users/UserManagementView';

const SETTINGS_SYSTEM_USERS_TAB = 'system_users';

type PdfMappingSlot = {
  key: string;
  label: string;
  description: string;
  types?: FormField['type'][];
};

const PDF_MAPPING_GROUPS: Array<{ title: string; slots: PdfMappingSlot[] }> = [
  {
    title: 'Header and assignment',
    slots: [
      {
        key: 'workOrderNumber',
        label: 'Work Order number',
        description:
          'Automatically uses the number saved on this submitted Work Order. Each Work Order has its own number, independent of its parent assignment.',
      },
      {
        key: 'jobNumber',
        label: 'DR Traffic job number',
        description: 'Project or job identifier.',
      },
      {
        key: 'jobName',
        label: 'Job name',
        description: 'Project or assignment name.',
      },
      {
        key: 'workDate',
        label: 'Work date',
        description: 'Date displayed in the header.',
        types: ['date', 'text'],
      },
      {
        key: 'description',
        label: 'Description of work',
        description: 'Main work description.',
      },
      {
        key: 'client',
        label: 'Client',
        description: 'Client or company name.',
      },
      {
        key: 'customerOrderNumber',
        label: 'Customer order number',
        description: 'Customer PO or order number.',
      },
      {
        key: 'contact',
        label: 'Contact',
        description: 'Customer or requester contact.',
      },
      {
        key: 'workShift',
        label: 'Work shift',
        description: 'Shift name or shift type.',
      },
      {
        key: 'workOrderTypes',
        label: 'Work Order types',
        description: 'Checkbox row under the header.',
        types: ['work_order_types', 'dropdown'],
      },
    ],
  },
  {
    title: 'Tables and notes',
    slots: [
      {
        key: 'workers',
        label: 'Labor and hours',
        description: 'Structured worker timesheet rows.',
        types: ['timesheet'],
      },
      {
        key: 'equipment',
        label: 'Equipment',
        description: 'Equipment rows used in the shift.',
        types: ['resource_usage'],
      },
      {
        key: 'materials',
        label: 'Materials',
        description: 'Material rows, types and quantities.',
        types: ['resource_usage'],
      },
      {
        key: 'notes',
        label: 'Notes',
        description: 'Text printed in the Notes column.',
        types: ['textarea', 'text'],
      },
    ],
  },
  {
    title: 'Signatures',
    slots: [
      {
        key: 'leadSignature',
        label: 'DR Traffic / Lead signature',
        description: 'Left signature in the PDF footer.',
        types: ['signature'],
      },
      {
        key: 'customerSignature',
        label: 'Owner / General Contractor signature',
        description: 'Right signature in the PDF footer.',
        types: ['signature'],
      },
    ],
  },
];

type PdfBuilderConfig = NonNullable<CompanySettings['workOrderPdfBuilder']>;

const PDF_SECTION_OPTIONS = [
  { key: 'header', label: 'Header and company information' },
  { key: 'types', label: 'Work Order type checks' },
  { key: 'labor', label: 'Labor and hours' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'materials', label: 'Materials' },
  { key: 'notes', label: 'Notes' },
  { key: 'signatures', label: 'Footer signatures' },
] as const;

const PDF_LABEL_OPTIONS = [
  ['documentTitle', 'Document title', 'WORK ORDER'],
  ['number', 'Number prefix', 'No.'],
  ['jobNumber', 'Job number', 'DR TRAFFIC JOB#'],
  ['jobName', 'Job name', 'JOB NAME:'],
  ['workDate', 'Date', 'DATE:'],
  ['description', 'Description', 'DESCRIPTION OF WORK:'],
  ['client', 'Client', 'CLIENT:'],
  ['customerOrderNumber', 'Customer order', 'CUSTOMER ORDER #'],
  ['contact', 'Contact', 'CONTACT:'],
  ['workShift', 'Shift', 'WORK SHIFT'],
  ['labor', 'Labor section', 'LABOR'],
  ['hours', 'Hours section', 'HOURS'],
  ['equipment', 'Equipment section', 'EQUIPMENT'],
  ['employeeName', 'Employee column', 'EMPLOYEE NAME'],
  ['start', 'Start column', 'START'],
  ['end', 'End column', 'END'],
  ['regularHours', 'Regular hours column', 'REG'],
  ['overtimeHours', 'Overtime column', 'OT'],
  ['doubleTimeHours', 'Double time column', 'DT'],
  ['equipmentId', 'Equipment ID column', 'EQUIP ID'],
  ['equipmentDescription', 'Equipment description column', 'EQUIP DESCRIPTION'],
  ['equipmentHours', 'Equipment hours column', 'HRS'],
  ['materials', 'Materials section', 'MATERIAL'],
  ['notes', 'Notes section', 'NOTES'],
  ['materialDescription', 'Material description column', 'DESCRIPTION'],
  ['materialType', 'Material type column', 'TYPE'],
  ['materialQuantity', 'Material quantity column', 'QTY'],
  ['leadSignature', 'Lead signature', 'DR TRAFFIC REP. (NAME)'],
  [
    'customerSignature',
    'Customer signature',
    'OWNER / GENERAL CONTRACTOR REP. (NAME)',
  ],
] as const;

function defaultPdfBuilderConfig(templateId = ''): PdfBuilderConfig {
  return {
    version: 2,
    templateId,
    fields: {},
    layout: {
      accentColor: '#ed7376',
      workerRows: 7,
      materialRows: 13,
      filenameTemplate: '{projectNumber} - {projectName} - {materialTypes}',
      labels: {},
      sections: {},
    },
  };
}

function normalizedFrontendPdfConfig(
  value: CompanySettings['workOrderPdfBuilder'],
): PdfBuilderConfig {
  const defaults = defaultPdfBuilderConfig(value?.templateId || '');
  return {
    ...defaults,
    ...value,
    fields: { ...(value?.fields || {}) },
    layout: {
      ...defaults.layout,
      ...(value?.layout || {}),
      labels: { ...(value?.layout?.labels || {}) },
      sections: { ...(value?.layout?.sections || {}) },
    },
  };
}

const SettingsView: React.FC = () => {
  const { settings, updateSettings, currentPage, formTemplates } =
    useAppContext();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const showUsersTab = hasPermission('admin');
  const [activeTab, setActiveTab] = useState('company');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (currentPage !== 'settings') return;
    const target = sessionStorage.getItem('settings_target_tab');
    if (target) {
      setActiveTab(target);
      sessionStorage.removeItem('settings_target_tab');
    }
  }, [currentPage]);

  const showSaved = () => {
    setSaved(true);
    toast({
      title: 'Settings saved',
      description: 'Your changes were saved successfully.',
    });
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { key: 'company', label: 'Company Profile', icon: <Building2 size={16} /> },
    ...(showUsersTab
      ? ([
          {
            key: SETTINGS_SYSTEM_USERS_TAB,
            label: 'System users',
            icon: <UserCog size={16} />,
          },
        ] as const)
      : []),
    { key: 'overtime', label: 'Overtime Rules', icon: <Clock size={16} /> },
    {
      key: 'pdf_builder',
      label: 'PDF Builder',
      icon: <FileOutput size={16} />,
    },
    { key: 'worker_types', label: 'Worker Types', icon: <Users size={16} /> },
    { key: 'shift_types', label: 'Shift Types', icon: <Clock size={16} /> },
    { key: 'worker_roles', label: 'Worker Roles', icon: <UserCog size={16} /> },
    {
      key: 'equipment_types',
      label: 'Equipment Types',
      icon: <Truck size={16} />,
    },
    {
      key: 'material_types',
      label: 'Material Types',
      icon: <Package size={16} />,
    },
    {
      key: 'certifications',
      label: 'Certifications',
      icon: <Shield size={16} />,
    },
    { key: 'skills', label: 'Skills', icon: <Sparkles size={16} /> },
    {
      key: 'project_types',
      label: 'Project Types',
      icon: <Building2 size={16} />,
    },
    {
      key: 'work_order_types',
      label: 'Assignment Types',
      icon: <Building2 size={16} />,
    },
    {
      key: 'status_catalog',
      label: 'Status Catalog',
      icon: <ListChecks size={16} />,
    },
  ];

  return (
    <div className="p-3 sm:p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Settings</h2>
          <p className="text-sm text-gray-500">Configure your platform</p>
        </div>
        {saved && (
          <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-medium animate-pulse">
            Settings saved successfully!
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:gap-6">
        {}
        <div className="w-full shrink-0 lg:w-56">
          <select
            aria-label="Settings section"
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-3 text-sm lg:hidden"
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
          <div className="hidden space-y-1 lg:block">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {}
        <div
          className={`min-w-0 flex-1 ${activeTab === 'pdf_builder' || activeTab === 'project_types' || activeTab === 'work_order_types' || activeTab === 'shift_types' || activeTab === 'status_catalog' || activeTab === 'certifications' || activeTab === 'skills' || activeTab === 'worker_roles' || activeTab === SETTINGS_SYSTEM_USERS_TAB ? '' : 'max-w-2xl'}`}
        >
          {activeTab === 'company' && (
            <div className="space-y-6">
              <CompanySettings
                settings={settings}
                updateSettings={updateSettings}
                onSave={showSaved}
              />
              {}
            </div>
          )}
          {activeTab === SETTINGS_SYSTEM_USERS_TAB && showUsersTab && (
            <UserManagementView embedded />
          )}
          {activeTab === 'overtime' && (
            <OvertimeSettings
              settings={settings}
              updateSettings={updateSettings}
              onSave={showSaved}
            />
          )}
          {activeTab === 'pdf_builder' && (
            <PdfBuilderSettings
              settings={settings}
              templates={formTemplates}
              updateSettings={updateSettings}
              onSave={showSaved}
            />
          )}
          {activeTab === 'worker_types' && (
            <CatalogSettings
              title="Worker Types"
              items={settings.workerTypes}
              onUpdate={async (items) => {
                await updateSettings({ workerTypes: items });
                showSaved();
              }}
            />
          )}
          {activeTab === 'shift_types' && <ShiftTypesView embedded />}
          {activeTab === 'worker_roles' && <WorkerRolesView embedded />}
          {activeTab === 'equipment_types' && (
            <CatalogSettings
              title="Equipment Types"
              items={settings.equipmentTypes}
              onUpdate={async (items) => {
                await updateSettings({ equipmentTypes: items });
                showSaved();
              }}
            />
          )}
          {activeTab === 'material_types' && (
            <CatalogSettings
              title="Material Types"
              items={settings.materialTypes}
              onUpdate={async (items) => {
                await updateSettings({ materialTypes: items });
                showSaved();
              }}
            />
          )}
          {activeTab === 'certifications' && <CertificationsView embedded />}
          {activeTab === 'skills' && <SkillsView embedded />}
          {activeTab === 'project_types' && <ProjectTypesView embedded />}
          {activeTab === 'work_order_types' && <WorkOrderTypesView embedded />}
          {activeTab === 'status_catalog' && <StatusCatalogView embedded />}
        </div>
      </div>
    </div>
  );
};

const PdfBuilderSettings: React.FC<{
  settings: CompanySettings;
  templates: FormTemplate[];
  updateSettings: (settings: Partial<CompanySettings>) => Promise<void>;
  onSave: () => void;
}> = ({ settings, templates, updateSettings, onSave }) => {
  const { toast } = useToast();
  const workOrderTemplates = templates.filter((template) => {
    const category = String(template.category || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    const name = String(template.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    return category.includes('workorder') || name.includes('workorder');
  });
  const [config, setConfig] = useState<PdfBuilderConfig>(() =>
    normalizedFrontendPdfConfig(settings.workOrderPdfBuilder),
  );
  const [activeEditor, setActiveEditor] = useState<
    'mapping' | 'design' | 'preview'
  >('mapping');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [numberPreview, setNumberPreview] = useState('');

  useEffect(() => {
    let cancelled = false;
    setNumberPreview('');
    dbPreviewNextWorkOrderNumber()
      .then(({ number }) => {
        if (!cancelled) setNumberPreview(number);
      })
      .catch(() => {
        if (!cancelled) setNumberPreview('Preview unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [
    settings.workOrderNumberPrefix,
    settings.workOrderNumberPadding,
    settings.workOrderNumberReset,
    settings.workOrderNumberTemplate,
  ]);

  useEffect(() => {
    setConfig(normalizedFrontendPdfConfig(settings.workOrderPdfBuilder));
  }, [settings.workOrderPdfBuilder]);

  const selectedTemplate = workOrderTemplates.find(
    (template) => template.id === config.templateId,
  );
  const updateTemplate = (templateId: string) => {
    const nextTemplate = workOrderTemplates.find(
      (template) => template.id === templateId,
    );
    const validIds = new Set(
      (nextTemplate?.fields || []).map((field) => field.id),
    );
    setConfig((current) => ({
      ...current,
      templateId,
      fields: Object.fromEntries(
        Object.entries(current.fields || {}).filter(([, fieldId]) =>
          validIds.has(fieldId),
        ),
      ),
    }));
  };
  const fieldsForSlot = (slot: PdfMappingSlot) =>
    (selectedTemplate?.fields || []).filter(
      (field) => !slot.types || slot.types.includes(field.type),
    );
  const validFieldIds = new Set(
    (selectedTemplate?.fields || []).map((field) => field.id),
  );
  const invalidMappings = Object.entries(config.fields || {}).filter(
    ([, fieldId]) => fieldId && !validFieldIds.has(fieldId),
  );
  const layout = config.layout || defaultPdfBuilderConfig().layout!;
  const labels = layout.labels || {};
  const sections = layout.sections || {};
  const setLayout = (patch: Partial<NonNullable<PdfBuilderConfig['layout']>>) =>
    setConfig((current) => ({
      ...current,
      layout: {
        ...defaultPdfBuilderConfig().layout,
        ...(current.layout || {}),
        ...patch,
      },
    }));
  const previewLabel = (key: string, fallback: string) =>
    labels[key]?.trim() || fallback;
  const previewRows = Math.min(7, Math.max(3, Number(layout.workerRows || 7)));
  const previewMaterialRows = Math.min(
    8,
    Math.max(3, Number(layout.materialRows || 13)),
  );
  const editorTabs = [
    {
      key: 'mapping' as const,
      label: 'Field mapping',
      icon: <FileOutput size={15} />,
    },
    {
      key: 'design' as const,
      label: 'Layout & labels',
      icon: <SlidersHorizontal size={15} />,
    },
    { key: 'preview' as const, label: 'Live preview', icon: <Eye size={15} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Work Order PDF Builder
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Map every logical area of the generated PDF to a field in one
              dynamic form. Areas left on Automatic continue using project,
              assignment and shift data.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Builder v{config.version || 2}
          </span>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
          Dynamic form used by this PDF
        </label>
        <select
          value={config.templateId}
          onChange={(event) => updateTemplate(event.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Use current automatic mapping</option>
          {workOrderTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {editorTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveEditor(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                activeEditor === tab.key
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {invalidMappings.length > 0 ? (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              Some mappings reference fields that no longer exist.
            </p>
            <p className="mt-1">
              Reset or select a valid field before saving:{' '}
              {invalidMappings.map(([slot]) => slot).join(', ')}.
            </p>
          </div>
        </div>
      ) : null}

      {activeEditor === 'mapping' && config.templateId ? (
        PDF_MAPPING_GROUPS.map((group) => (
          <div
            key={group.title}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <h4 className="text-sm font-semibold text-gray-900">
              {group.title}
            </h4>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {group.slots.map((slot) => {
                const availableFields = fieldsForSlot(slot);
                return (
                  <label
                    key={slot.key}
                    className="block rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <span className="block text-sm font-semibold text-gray-800">
                      {slot.label}
                    </span>
                    <span className="mt-0.5 block min-h-[32px] text-xs text-gray-500">
                      {slot.description}
                    </span>
                    <select
                      value={config.fields?.[slot.key] || ''}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          fields: {
                            ...(current.fields || {}),
                            [slot.key]: event.target.value,
                          },
                        }))
                      }
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
                    >
                      <option value="">Automatic source</option>
                      {availableFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label} ({field.type})
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        ))
      ) : activeEditor === 'mapping' ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Select a Work Order dynamic form to configure its PDF mappings.
        </div>
      ) : null}

      {activeEditor === 'design' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h4 className="text-sm font-semibold text-gray-900">
                Appearance and capacity
              </h4>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="text-xs font-semibold text-gray-600">
                  Accent color
                  <input
                    type="color"
                    value={layout.accentColor || '#ed7376'}
                    onChange={(event) =>
                      setLayout({ accentColor: event.target.value })
                    }
                    className="mt-2 h-10 w-full rounded border border-gray-300 bg-white p-1"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Labor rows
                  <input
                    type="number"
                    min={4}
                    max={12}
                    value={layout.workerRows || 7}
                    onChange={(event) =>
                      setLayout({
                        workerRows: Math.min(
                          12,
                          Math.max(4, Number(event.target.value) || 7),
                        ),
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600">
                  Material rows
                  <input
                    type="number"
                    min={5}
                    max={18}
                    value={layout.materialRows || 13}
                    onChange={(event) =>
                      setLayout({
                        materialRows: Math.min(
                          18,
                          Math.max(5, Number(event.target.value) || 13),
                        ),
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-semibold text-gray-600">
                PDF filename template
                <input
                  value={layout.filenameTemplate || ''}
                  onChange={(event) =>
                    setLayout({ filenameTemplate: event.target.value })
                  }
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="{projectNumber} - {projectName} - {materialTypes}"
                />
                <span className="mt-1 block font-normal text-gray-500">
                  Tokens: {'{projectNumber}'}, {'{projectName}'},{' '}
                  {'{materialTypes}'}, {'{workOrderNumber}'}, {'{shiftDate}'}
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h4 className="text-sm font-semibold text-gray-900">
                Visible sections
              </h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PDF_SECTION_OPTIONS.map((section) => (
                  <label
                    key={section.key}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={sections[section.key] !== false}
                      onChange={(event) =>
                        setLayout({
                          sections: {
                            ...sections,
                            [section.key]: event.target.checked,
                          },
                        })
                      }
                    />
                    {section.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h4 className="text-sm font-semibold text-gray-900">
              Custom labels
            </h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PDF_LABEL_OPTIONS.map(([key, label, fallback]) => (
                <label
                  key={key}
                  className="text-xs font-semibold text-gray-600"
                >
                  {label}
                  <input
                    value={labels[key] ?? ''}
                    onChange={(event) =>
                      setLayout({
                        labels: { ...labels, [key]: event.target.value },
                      })
                    }
                    placeholder={fallback}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeEditor === 'preview' ? (
        <div className="rounded-xl border border-gray-200 bg-slate-100 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Live layout preview
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                Representative data is used here. The number previews saved
                Company numbering settings. Each submitted Work Order receives
                its own number. Editing or regenerating it keeps that number.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-gray-500">
                US Letter
              </span>
              <button
                type="button"
                disabled={isGeneratingPreview}
                onClick={async () => {
                  setIsGeneratingPreview(true);
                  try {
                    const blob = await dbPreviewWorkOrderPdfBuilder(config);
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'work-order-pdf-builder-preview.pdf';
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (error) {
                    toast({
                      title: 'Could not generate PDF preview',
                      description:
                        error instanceof Error
                          ? error.message
                          : 'Please try again.',
                      variant: 'destructive',
                    });
                  } finally {
                    setIsGeneratingPreview(false);
                  }
                }}
                className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <FileOutput size={14} />{' '}
                {isGeneratingPreview ? 'Generating...' : 'Download test PDF'}
              </button>
            </div>
          </div>
          <div className="mx-auto aspect-[612/792] w-full max-w-[720px] overflow-hidden border border-gray-300 bg-white p-[4%] text-[8px] shadow-lg">
            {sections.header !== false ? (
              <div className="mb-4 grid grid-cols-3 items-center gap-2">
                <div className="text-2xl font-black tracking-tight">DR</div>
                <div className="text-center text-sm font-black">
                  {previewLabel('documentTitle', 'WORK ORDER')}
                </div>
                <div className="text-right text-sm font-black text-red-700">
                  {previewLabel('number', 'No.')} {numberPreview || '…'}
                </div>
              </div>
            ) : (
              <div className="mb-4 h-6 rounded bg-slate-50" />
            )}
            <div className="grid grid-cols-3 border-l border-t border-black">
              {[
                [previewLabel('jobNumber', 'DR TRAFFIC JOB#'), '23'],
                [previewLabel('jobName', 'JOB NAME:'), '2399 - Folsom Street'],
                [previewLabel('workDate', 'DATE:'), '2026-08-02'],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-r border-black p-1">
                  <b>{label}</b>
                  <div>{value}</div>
                </div>
              ))}
              <div className="col-span-3 border-b border-r border-black p-1">
                <b>{previewLabel('description', 'DESCRIPTION OF WORK:')}</b>
                <div>Traffic control services</div>
              </div>
            </div>
            {sections.types !== false ? (
              <div className="grid grid-cols-5 border-l border-black">
                {[
                  'FIELD SERVICE',
                  'INTERNAL SALE',
                  'SALES',
                  'ON RENT',
                  'OFF RENT',
                ].map((type, index) => (
                  <div
                    key={type}
                    className="flex justify-between border-b border-r border-black p-1"
                  >
                    <b>{type}</b>
                    <span>{index > 1 ? '☑' : '☐'}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div
              className="mt-0 grid grid-cols-3 text-center font-black text-black"
              style={{ backgroundColor: layout.accentColor || '#ed7376' }}
            >
              <div className="border border-black p-1">
                {previewLabel('labor', 'LABOR')}
              </div>
              <div className="border-y border-r border-black p-1">
                {previewLabel('hours', 'HOURS')}
              </div>
              <div className="border-y border-r border-black p-1">
                {previewLabel('equipment', 'EQUIPMENT')}
              </div>
            </div>
            <div className="grid grid-cols-[2fr_1fr_2fr] border-l border-black">
              {Array.from({ length: previewRows }).map((_, index) => (
                <React.Fragment key={index}>
                  <div className="border-b border-r border-black p-1">
                    {index === 0 && sections.labor !== false
                      ? 'Fernando Perez / Sign'
                      : 'Name / Sign'}
                  </div>
                  <div className="border-b border-r border-black p-1 text-center">
                    {index === 0 && sections.labor !== false
                      ? '8 / .5 / 0'
                      : 'ST / OT / DT'}
                  </div>
                  <div className="border-b border-r border-black p-1">
                    {index === 0 && sections.equipment !== false
                      ? '03_05 - Mini Maxi'
                      : ''}
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div
              className="grid grid-cols-2 text-center font-black text-black"
              style={{ backgroundColor: layout.accentColor || '#ed7376' }}
            >
              <div className="border border-black p-1">
                {previewLabel('materials', 'MATERIAL')}
              </div>
              <div className="border-y border-r border-black p-1">
                {previewLabel('notes', 'NOTES')}
              </div>
            </div>
            <div className="grid grid-cols-2 border-l border-black">
              {Array.from({ length: previewMaterialRows }).map((_, index) => (
                <React.Fragment key={index}>
                  <div className="border-b border-r border-black p-1">
                    {index < 3 && sections.materials !== false
                      ? [
                          'Butyl Pads - Sales',
                          'Paint - On Rent',
                          'Spray Paint - Off Rent',
                        ][index]
                      : ''}
                  </div>
                  <div className="border-b border-r border-black p-1">
                    {index === 0 && sections.notes !== false
                      ? 'Mapped notes...'
                      : ''}
                  </div>
                </React.Fragment>
              ))}
            </div>
            {sections.signatures !== false ? (
              <div className="mt-7 grid grid-cols-2 gap-8">
                <div>
                  <b>
                    {previewLabel('leadSignature', 'DR TRAFFIC REP. (NAME)')}
                  </b>
                  <div className="mt-3 border-b border-black italic">
                    Lead signature
                  </div>
                </div>
                <div>
                  <b>
                    {previewLabel(
                      'customerSignature',
                      'OWNER / GENERAL CONTRACTOR REP. (NAME)',
                    )}
                  </b>
                  <div className="mt-3 border-b border-black italic">
                    Customer signature
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={() =>
            setConfig(defaultPdfBuilderConfig(config.templateId || ''))
          }
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RotateCcw size={16} /> Reset builder
        </button>
        <button
          type="button"
          disabled={isSaving || invalidMappings.length > 0}
          onClick={async () => {
            setIsSaving(true);
            try {
              await updateSettings({
                workOrderPdfBuilder: {
                  ...config,
                  version: 2,
                  updatedAt: new Date().toISOString(),
                },
              });
              onSave();
            } finally {
              setIsSaving(false);
            }
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} /> {isSaving ? 'Saving...' : 'Save PDF Builder'}
        </button>
      </div>
    </div>
  );
};

type NumberingPreset = 'prefix-year-number' | 'number-only' | 'custom';

const NUMBERING_TEMPLATE_PATTERN =
  /^(?=.*\{N+\})(?:[^{}]|\{(?:PREFIX|YYYY|YY|MM|DD|N+)\})+$/i;

const NUMBERING_PRESETS: Record<
  Exclude<NumberingPreset, 'custom'>,
  {
    label: string;
    description: string;
    prefix: string;
    padding: number;
    template: string;
  }
> = {
  'prefix-year-number': {
    label: 'Prefix + Year + Number',
    description: 'Example: ASN-2026-0001',
    prefix: 'ASN',
    padding: 4,
    template: '{PREFIX}-{YYYY}-{NNNN}',
  },
  'number-only': {
    label: 'Number only',
    description: 'Example: 00001',
    prefix: '',
    padding: 5,
    template: '{NNNNN}',
  },
};

function detectNumberingPreset(
  _prefix: string,
  _padding: number,
  template: string,
): NumberingPreset {
  if (/^\{N+\}$/i.test(template)) {
    return 'number-only';
  }
  if (/^\{PREFIX\}-\{YYYY\}-\{N+\}$/i.test(template)) {
    return 'prefix-year-number';
  }
  return 'custom';
}

function buildPresetTemplate(
  key: Exclude<NumberingPreset, 'custom'>,
  padding: number,
): string {
  const n = 'N'.repeat(Math.max(2, Math.min(10, padding)));
  if (key === 'prefix-year-number') {
    return `{PREFIX}-{YYYY}-{${n}}`;
  }
  return `{${n}}`;
}

const CompanySettings: React.FC<{
  settings: any;
  updateSettings: any;
  onSave: () => void;
}> = ({ settings, updateSettings, onSave }) => {
  const [form, setForm] = useState({
    name: settings.name,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    minimumRestHours: Number(settings.minimumRestHours ?? 8),
    workOrderNumberPrefix: settings.workOrderNumberPrefix ?? 'ASN',
    workOrderNumberPadding: Number(settings.workOrderNumberPadding ?? 4),
    workOrderNumberReset: settings.workOrderNumberReset ?? 'yearly',
    workOrderNumberTemplate:
      settings.workOrderNumberTemplate ?? '{PREFIX}-{YYYY}-{NNNN}',
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewNumber, setPreviewNumber] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [numberingPreset, setNumberingPreset] = useState<NumberingPreset>(() =>
    detectNumberingPreset(
      settings.workOrderNumberPrefix ?? 'ASN',
      Number(settings.workOrderNumberPadding ?? 4),
      settings.workOrderNumberTemplate ?? '{PREFIX}-{YYYY}-{NNNN}',
    ),
  );
  const { toast } = useToast();

  useEffect(() => {
    setNumberingPreset(
      detectNumberingPreset(
        form.workOrderNumberPrefix,
        form.workOrderNumberPadding,
        form.workOrderNumberTemplate,
      ),
    );
  }, [
    form.workOrderNumberPrefix,
    form.workOrderNumberPadding,
    form.workOrderNumberTemplate,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      dbPreviewNextWorkOrderNumber()
        .then(({ number }) => {
          if (!cancelled) setPreviewNumber(number);
        })
        .catch(() => {
          if (!cancelled) setPreviewNumber('Preview unavailable');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    settings.workOrderNumberPrefix,
    settings.workOrderNumberPadding,
    settings.workOrderNumberReset,
    settings.workOrderNumberTemplate,
  ]);

  const handleLogoChange = async (
    field: 'logo' | 'logoIcon',
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(field);
    try {
      const uploadFn = field === 'logo' ? dbUploadLogo : dbUploadLogoIcon;
      const result = await uploadFn(file);
      if (!result?.url) {
        throw new Error('Server returned an empty URL for the uploaded file.');
      }
      await updateSettings({ [field]: result.url });
      toast({
        title: `${field === 'logo' ? 'Logo' : 'Icon'} uploaded`,
        description: 'Company logo updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error ? error.message : 'Could not upload image.',
        variant: 'destructive',
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-6 space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Company Profile</h3>

      <div className="flex flex-col items-start gap-6 mb-4 xl:flex-row xl:flex-wrap">
        <div className="flex items-center gap-4">
          <img
            src={settings.logo}
            alt="Logo"
            className="h-auto max-h-16 w-36 max-w-full object-contain sm:w-48"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Banner Logo</p>
            <label className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 cursor-pointer">
              <Upload size={12} />
              {uploading === 'logo' ? 'Uploading...' : 'Change'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={(e) => handleLogoChange('logo', e)}
                className="hidden"
                disabled={uploading !== null}
              />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <img
            src={settings.logoIcon || settings.logo || '/drtraffic-logo.png'}
            alt="Icon"
            className="h-12 w-12 rounded-lg object-contain bg-white"
          />
          <div>
            <p className="text-sm font-medium text-gray-700">Icon (Square)</p>
            <label className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 cursor-pointer">
              <Upload size={12} />
              {uploading === 'logoIcon' ? 'Uploading...' : 'Change'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={(e) => handleLogoChange('logoIcon', e)}
                className="hidden"
                disabled={uploading !== null}
              />
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Company Name
        </label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address
        </label>
        <input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="responsive-grid grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Minimum Rest Hours Between Shifts
        </label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={form.minimumRestHours}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              minimumRestHours: parseFloat(e.target.value),
            }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          Used to warn when assigning workers who haven't had enough rest
          between shifts.
        </p>
      </div>

      <div className="border-t border-gray-200 pt-4 mt-2">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">
          Assignment and Work Order Numbering
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          Configure the sequence used by new assignments and Work Order forms.
          Each Work Order form receives its own number when its first PDF is
          generated, even when several forms belong to the same assignment.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {(
            Object.keys(NUMBERING_PRESETS) as Array<
              keyof typeof NUMBERING_PRESETS
            >
          ).map((key) => {
            const preset = NUMBERING_PRESETS[key];
            const active = numberingPreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setNumberingPreset(key);
                  setForm((f) => ({
                    ...f,
                    workOrderNumberPrefix: preset.prefix,
                    workOrderNumberPadding: preset.padding,
                    workOrderNumberTemplate: preset.template,
                  }));
                }}
                className={`text-left border rounded-lg px-3 py-2 transition-colors ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div
                  className={`text-sm font-medium ${
                    active ? 'text-primary' : 'text-gray-800'
                  }`}
                >
                  {preset.label}
                </div>
                <div className="text-xs text-gray-500">
                  {preset.description}
                </div>
              </button>
            );
          })}
        </div>

        <div className="responsive-grid grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prefix
            </label>
            <input
              value={form.workOrderNumberPrefix}
              maxLength={16}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  workOrderNumberPrefix: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 16),
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="ASN"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to remove the prefix.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sequence Digits
            </label>
            <input
              type="number"
              min={2}
              max={10}
              value={form.workOrderNumberPadding}
              onChange={(e) => {
                const digits = Math.max(
                  2,
                  Math.min(10, Number(e.target.value) || 4),
                );
                setForm((f) => {
                  const next = {
                    ...f,
                    workOrderNumberPadding: digits,
                  };
                  if (numberingPreset !== 'custom') {
                    next.workOrderNumberTemplate = buildPresetTemplate(
                      numberingPreset,
                      digits,
                    );
                  }
                  return next;
                });
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reset
          </label>
          <select
            value={form.workOrderNumberReset}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                workOrderNumberReset: e.target.value as
                  | 'never'
                  | 'yearly'
                  | 'monthly',
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="never">Never (single continuous sequence)</option>
            <option value="yearly">Yearly (reset every January 1)</option>
            <option value="monthly">Monthly (reset every 1st)</option>
          </select>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template
          </label>
          <input
            value={form.workOrderNumberTemplate}
            maxLength={64}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                workOrderNumberTemplate: e.target.value,
              }))
            }
            className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
              NUMBERING_TEMPLATE_PATTERN.test(form.workOrderNumberTemplate)
                ? 'border-gray-300'
                : 'border-red-300 focus:border-red-500 focus:ring-red-500'
            }`}
            placeholder="{PREFIX}-{YYYY}-{NNNN}"
          />
          <p className="text-xs text-gray-500 mt-1">
            Tokens: <code>{'{PREFIX}'}</code> <code>{'{YYYY}'}</code>{' '}
            <code>{'{YY}'}</code> <code>{'{MM}'}</code> <code>{'{DD}'}</code>{' '}
            <code>{'{NNNN}'}</code> (more N's = wider sequence). Use {'{NNNNN}'}{' '}
            for numbers only, without prefix or year. Once a Work Order form has
            its own number, editing or regenerating its PDF preserves it.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Next number (saved settings):
          </span>
          {previewNumber && (
            <span className="text-sm font-mono text-gray-700 bg-gray-50 px-2 py-1 rounded">
              {previewNumber}
            </span>
          )}
        </div>
      </div>

      <button
        disabled={
          isSaving ||
          !NUMBERING_TEMPLATE_PATTERN.test(form.workOrderNumberTemplate)
        }
        onClick={async () => {
          if (!NUMBERING_TEMPLATE_PATTERN.test(form.workOrderNumberTemplate)) {
            toast({
              title: 'Invalid numbering template',
              description:
                'Include a sequence token like {NNNN} and use only the supported tokens.',
              variant: 'destructive',
            });
            return;
          }
          setIsSaving(true);
          try {
            await updateSettings(form);
            setPreviewNumber('');
            try {
              const { number } = await dbPreviewNextWorkOrderNumber();
              setPreviewNumber(number);
            } catch {
              setPreviewNumber('Preview unavailable');
            }
            onSave();
          } catch (error) {
            toast({
              title: 'Could not save settings',
              description:
                error instanceof Error ? error.message : 'Please try again.',
              variant: 'destructive',
            });
          } finally {
            setIsSaving(false);
          }
        }}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save size={14} /> {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
};

const OvertimeSettings: React.FC<{
  settings: any;
  updateSettings: any;
  onSave: () => void;
}> = ({ settings, updateSettings, onSave }) => {
  const [rules, setRules] = useState(settings.overtimeRules);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setRules(settings.overtimeRules);
  }, [settings.overtimeRules]);
  const noLunchCreditTarget = rules.noLunchCreditTarget === 'ot' ? 'OT' : 'ST';
  const noLunchCreditEffectiveDate =
    rules.noLunchCreditEffectiveDate || '2026-07-08';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-6 space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Overtime Rules</h3>
      <p className="text-sm text-gray-500">
        Configure how overtime is calculated for payroll
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rule Name
        </label>
        <input
          value={rules.name}
          onChange={(e) =>
            setRules((r: any) => ({ ...r, name: e.target.value }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="responsive-grid grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Regular Hours Limit
          </label>
          <input
            type="number"
            value={rules.regularHoursLimit}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                regularHoursLimit: parseFloat(e.target.value),
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Overtime Multiplier
          </label>
          <input
            type="number"
            step="0.1"
            value={rules.overtimeMultiplier}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                overtimeMultiplier: parseFloat(e.target.value),
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Double Time Threshold (hrs)
          </label>
          <input
            type="number"
            value={rules.doubleTimeThreshold}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                doubleTimeThreshold: parseFloat(e.target.value),
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Double Time Multiplier
          </label>
          <input
            type="number"
            step="0.1"
            value={rules.doubleTimeMultiplier}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                doubleTimeMultiplier: parseFloat(e.target.value),
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between gap-4 flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              No Lunch and Break Credit
            </p>
            <p className="text-xs text-gray-500">
              Add paid time when the worker reports that lunch and break were
              not taken.
            </p>
          </div>
          <input
            type="checkbox"
            checked={rules.noLunchCreditEnabled ?? true}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                noLunchCreditEnabled: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
        </div>
        <div className="responsive-grid mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apply After Hours Worked
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={rules.noLunchCreditMinimumHours ?? 7}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  noLunchCreditMinimumHours: parseFloat(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Credit Hours
            </label>
            <input
              type="number"
              min={0}
              step={0.25}
              value={rules.noLunchCreditHours ?? 1}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  noLunchCreditHours: parseFloat(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Credit Goes To
            </label>
            <select
              value={rules.noLunchCreditTarget ?? 'ot'}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  noLunchCreditTarget: e.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="ot">Overtime (OT)</option>
              <option value="st">Standard Time (ST)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective Date
            </label>
            <input
              type="date"
              value={noLunchCreditEffectiveDate}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  noLunchCreditEffectiveDate: e.target.value,
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            Night Shift Premiums
          </p>
          <p className="text-xs text-gray-500">
            Additional amount paid per hour for night work.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              key: 'nightShiftPremium',
              label: 'Night Shift ($/hr)',
              fallback: 3,
            },
            {
              key: 'overtimeNightPremium',
              label: 'OT Night ($/hr)',
              fallback: 4.5,
            },
            {
              key: 'doubleTimeNightPremium',
              label: 'DT Night ($/hr)',
              fallback: 6,
            },
          ].map(({ key, label, fallback }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={rules[key] ?? fallback}
                onChange={(e) =>
                  setRules((r: any) => ({
                    ...r,
                    [key]: parseFloat(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Saturday Overtime
            </p>
            <p className="text-xs text-gray-500">
              Pay all Saturday hours as OT, then move them to DT after the
              configured threshold.
            </p>
          </div>
          <input
            type="checkbox"
            checked={rules.saturdayAllOvertime ?? true}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                saturdayAllOvertime: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
        </div>
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Saturday DT After Hours
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            disabled={!(rules.saturdayAllOvertime ?? true)}
            value={rules.saturdayDoubleTimeThreshold ?? 12}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                saturdayDoubleTimeThreshold: parseFloat(e.target.value),
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Sunday Double Time
            </p>
            <p className="text-xs text-gray-500">Pay all Sunday hours as DT.</p>
          </div>
          <input
            type="checkbox"
            checked={rules.sundayAllDoubleTime ?? true}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                sundayAllDoubleTime: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 border-t border-gray-200 pt-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            Allow Start Before Scheduled Time
          </p>
          <p className="text-xs text-gray-500">
            Allow earlier actual start times in timesheets, including mobile.
            Hours are recalculated using the actual start and end times.
          </p>
        </div>
        <input
          type="checkbox"
          checked={rules.allowEarlyStart ?? false}
          onChange={(e) =>
            setRules((r) => ({ ...r, allowEarlyStart: e.target.checked }))
          }
          className="h-4 w-4"
        />
      </label>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between gap-4 flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Yes Lunch and Break Deduction
            </p>
            <p className="text-xs text-gray-500">
              Deduct unpaid time when the worker reports that lunch and break
              were taken.
            </p>
          </div>
          <input
            type="checkbox"
            checked={rules.yesLunchDeductionEnabled ?? false}
            onChange={(e) =>
              setRules((r: any) => ({
                ...r,
                yesLunchDeductionEnabled: e.target.checked,
              }))
            }
            className="h-4 w-4"
          />
        </div>
        <div className="responsive-grid mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apply After Hours Worked
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={rules.yesLunchDeductionMinimumHours ?? 0}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  yesLunchDeductionMinimumHours: parseFloat(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deduction Hours
            </label>
            <input
              type="number"
              min={0}
              step={0.25}
              value={rules.yesLunchDeductionHours ?? 0}
              onChange={(e) =>
                setRules((r: any) => ({
                  ...r,
                  yesLunchDeductionHours: parseFloat(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
        <p className="font-medium mb-1">Current Rules:</p>
        <p>Regular: First {rules.regularHoursLimit} hours at 1x rate</p>
        <p>
          Overtime: After {rules.regularHoursLimit}h at{' '}
          {rules.overtimeMultiplier}x rate
        </p>
        <p>
          Double Time: After {rules.doubleTimeThreshold}h at{' '}
          {rules.doubleTimeMultiplier}x rate
        </p>
        <p>
          Night premiums: ST +${Number(rules.nightShiftPremium ?? 3).toFixed(2)}
          /hr, OT +${Number(rules.overtimeNightPremium ?? 4.5).toFixed(2)}/hr,
          DT +${Number(rules.doubleTimeNightPremium ?? 6).toFixed(2)}/hr
        </p>
        <p>
          Saturday:{' '}
          {(rules.saturdayAllOvertime ?? true)
            ? `All hours at OT; after ${rules.saturdayDoubleTimeThreshold ?? 12}h at DT`
            : 'Standard daily rules'}
        </p>
        <p>
          Sunday:{' '}
          {(rules.sundayAllDoubleTime ?? true)
            ? 'All hours at DT'
            : 'Standard daily rules'}
        </p>
        <p>
          No lunch/break:{' '}
          {(rules.noLunchCreditEnabled ?? true)
            ? `Add ${rules.noLunchCreditHours ?? 1}h to ${noLunchCreditTarget} after more than ${rules.noLunchCreditMinimumHours ?? 7} worked hours, effective ${noLunchCreditEffectiveDate}`
            : 'Disabled'}
        </p>
        <p>
          Yes lunch/break:{' '}
          {(rules.yesLunchDeductionEnabled ?? false)
            ? `Deduct ${rules.yesLunchDeductionHours ?? 0}h after more than ${rules.yesLunchDeductionMinimumHours ?? 0} worked hours`
            : 'Disabled'}
        </p>
      </div>

      <button
        type="button"
        disabled={isSaving}
        onClick={async () => {
          setIsSaving(true);
          try {
            await updateSettings({
              overtimeRules: {
                ...rules,
                noLunchCreditTarget: rules.noLunchCreditTarget ?? 'ot',
                noLunchCreditEffectiveDate,
              },
            });
            onSave();
          } catch (error) {
            console.error('Failed to save overtime rules', error);
            toast({
              title: 'Could not save rules',
              description: 'Please check your connection and try again.',
              variant: 'destructive',
            });
          } finally {
            setIsSaving(false);
          }
        }}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-1"
      >
        <Save size={14} /> {isSaving ? 'Saving...' : 'Save Rules'}
      </button>
    </div>
  );
};

const CatalogSettings: React.FC<{
  title: string;
  items: string[];
  onUpdate: (items: string[]) => Promise<void> | void;
}> = ({ title, items, onUpdate }) => {
  const { toast } = useToast();
  const [localItems, setLocalItems] = useState([...items]);
  const [newItem, setNewItem] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalItems([...items]);
  }, [items]);

  const saveItems = async (updated: string[]) => {
    setIsSaving(true);
    try {
      await onUpdate(updated);
      setLocalItems(updated);
      return true;
    } catch (error) {
      toast({
        title: 'Could not save catalog',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addItem = async () => {
    const normalized = newItem.trim();
    if (normalized && !localItems.includes(normalized)) {
      const updated = [...localItems, normalized];
      if (await saveItems(updated)) {
        setNewItem('');
      }
    }
  };

  const removeItem = async (idx: number) => {
    const updated = localItems.filter((_, i) => i !== idx);
    if (await saveItems(updated)) {
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const startEditing = (idx: number) => {
    setEditingIndex(idx);
    setEditValue(localItems[idx]);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const updateItem = async (idx: number) => {
    const normalized = editValue.trim();
    if (!normalized) {
      toast({
        title: 'Name is required',
        description: 'Enter a name before saving the catalog item.',
        variant: 'destructive',
      });
      return;
    }

    const isDuplicate = localItems.some(
      (item, itemIndex) =>
        itemIndex !== idx && item.toLowerCase() === normalized.toLowerCase(),
    );
    if (isDuplicate) {
      toast({
        title: 'Catalog item already exists',
        description: `“${normalized}” is already in this catalog.`,
        variant: 'destructive',
      });
      return;
    }

    if (normalized === localItems[idx]) {
      cancelEditing();
      return;
    }

    const updated = [...localItems];
    updated[idx] = normalized;
    if (await saveItems(updated)) {
      cancelEditing();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-6 space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">{title}</h3>
      <p className="text-sm text-gray-500">
        Add, edit, or remove configurable types. These are used throughout the
        platform.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addItem();
            }
          }}
          disabled={isSaving}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder={`Add new ${title.toLowerCase().replace(/ types?$/, '')} type...`}
        />
        <button
          disabled={isSaving}
          onClick={() => void addItem()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-1"
        >
          <Plus size={14} /> {isSaving ? 'Saving...' : 'Add'}
        </button>
      </div>

      <div className="space-y-1">
        {localItems.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 flex-wrap gap-3"
          >
            {editingIndex === idx ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void updateItem(idx);
                    }
                    if (event.key === 'Escape') {
                      cancelEditing();
                    }
                  }}
                  disabled={isSaving}
                  aria-label={`Edit ${item}`}
                  className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <div className="ml-2 flex items-center gap-1">
                  <button
                    disabled={isSaving}
                    onClick={() => void updateItem(idx)}
                    className="p-1 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 rounded"
                    title="Save changes"
                    aria-label={`Save changes to ${item}`}
                  >
                    <Save size={14} className="text-green-600" />
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={cancelEditing}
                    className="p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 rounded"
                    title="Cancel editing"
                    aria-label={`Cancel editing ${item}`}
                  >
                    <X size={14} className="text-gray-500" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm text-gray-700">{item}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={isSaving}
                    onClick={() => startEditing(idx)}
                    className="p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 rounded"
                    title="Edit type"
                    aria-label={`Edit ${item}`}
                  >
                    <Edit2 size={14} className="text-gray-500" />
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={() => void removeItem(idx)}
                    className="p-1 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 rounded"
                    title="Delete type"
                    aria-label={`Delete ${item}`}
                  >
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsView;
