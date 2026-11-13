import { useQueryClient } from '@tanstack/react-query';
import { completeAssignmentSnapshot, hasAssignmentRead } from '@/lib/assignmentPaging';
import { fetchAssignmentRecord } from '@/lib/db';
import { PAGE_RESOURCES } from '@/lib/appDataPages';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/hooks/use-app-data';
import type { AppResource } from '@/lib/appDataQueries';
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from 'react';
import {
  PageView,
  ShiftTemplate,
  StatusCatalogItem,
  WorkOrderType,
  ProjectType,
  Certification,
  Skill,
  WorkerRole,
  Worker,
  Equipment,
  Material,
  Client,
  Project,
  WorkOrder,
  CommercialCatalogItem,
  CommercialInvoice,
  CommercialWorkOrder,
  Timesheet,
  FormTemplate,
  FormSubmission,
  Incident,
  Notification,
  ActivityFeedItem,
  CompanySettings,
  TimesheetStatus,
  AvailabilityRequest,
} from '@/lib/types';
import {
  dbAddCertification,
  dbUpdateCertification,
  dbDeleteCertification,
  dbAddSkill,
  dbUpdateSkill,
  dbDeleteSkill,
  dbAddWorkerRole,
  dbUpdateWorkerRole,
  dbDeleteWorkerRole,
  dbAddWorkOrderType,
  dbUpdateWorkOrderType,
  dbDeleteWorkOrderType,
  dbAddProjectType,
  dbUpdateProjectType,
  dbDeleteProjectType,
  dbAddStatusCatalogItem,
  dbUpdateStatusCatalogItem,
  dbDeleteStatusCatalogItem,
  dbAddShift,
  dbUpdateShift,
  dbDeleteShift,
  dbUpdateSettings,
  dbAddWorker,
  dbUpdateWorker,
  dbDeleteWorker,
  dbAddEquipment,
  dbUpdateEquipment,
  dbDeleteEquipment,
  dbAddMaterial,
  dbUpdateMaterial,
  dbDeleteMaterial,
  dbDeleteMaterials,
  dbAddClient,
  dbUpdateClient,
  dbAddProject,
  dbUpdateProject,
  dbAddWorkOrder,
  dbUpdateWorkOrder,
  dbDeleteWorkOrder,
  dbRestoreWorkOrder,
  dbAddCommercialWorkOrder,
  dbUpdateCommercialWorkOrder,
  dbProcessCommercialWorkOrderOffRent,
  dbAddCommercialCatalogItem,
  dbUpdateCommercialCatalogItem,
  dbDeleteCommercialCatalogItem,
  dbGenerateCommercialInvoice,
  dbUpdateTimesheetStatus,
  dbAddFormTemplate,
  dbUpdateFormTemplate,
  dbMarkNotificationRead,
  dbMarkAllNotificationsRead,
  dbAddActivityFeedItem,
  dbAddAvailabilityRequest,
  dbUpdateAvailabilityRequest,
  dbAddTimesheet,
  dbAddFormSubmission,
  dbAddIncident,
  dbUpdateIncident,
  dbDeleteFormTemplate,
  dbDeleteFormSubmission,
} from '@/lib/db';

const ACTION_RESOURCES: Record<string, AppResource> = {
  updateSettings: 'settings',
  addShift: 'shifts',
  updateShift: 'shifts',
  deleteShift: 'shifts',
  addWorkOrderType: 'workOrderTypes',
  updateWorkOrderType: 'workOrderTypes',
  deleteWorkOrderType: 'workOrderTypes',
  addProjectType: 'projectTypes',
  updateProjectType: 'projectTypes',
  deleteProjectType: 'projectTypes',
  addStatusCatalogItem: 'statusCatalog',
  updateStatusCatalogItem: 'statusCatalog',
  deleteStatusCatalogItem: 'statusCatalog',
  addCertification: 'certifications',
  updateCertification: 'certifications',
  deleteCertification: 'certifications',
  addSkill: 'skills',
  updateSkill: 'skills',
  deleteSkill: 'skills',
  addWorkerRole: 'workerRoles',
  updateWorkerRole: 'workerRoles',
  deleteWorkerRole: 'workerRoles',
  addWorker: 'workers',
  updateWorker: 'workers',
  deleteWorker: 'workers',
  addEquipment: 'equipment',
  updateEquipment: 'equipment',
  deleteEquipment: 'equipment',
  addMaterial: 'materials',
  updateMaterial: 'materials',
  deleteMaterial: 'materials',
  addClient: 'clients',
  updateClient: 'clients',
  addProject: 'projects',
  updateProject: 'projects',
  addWorkOrder: 'workOrders',
  updateWorkOrder: 'workOrders',
  deleteWorkOrder: 'workOrders',
  restoreWorkOrder: 'workOrders',
  addCommercialCatalogItem: 'commercialCatalogItems',
  updateCommercialCatalogItem: 'commercialCatalogItems',
  deleteCommercialCatalogItem: 'commercialCatalogItems',
  addCommercialWorkOrder: 'commercialWorkOrders',
  updateCommercialWorkOrder: 'commercialWorkOrders',
  processCommercialWorkOrderOffRent: 'commercialWorkOrders',
  generateCommercialInvoice: 'commercialInvoices',
  addTimesheet: 'timesheets',
  updateTimesheetStatus: 'timesheets',
  addFormTemplate: 'formTemplates',
  updateFormTemplate: 'formTemplates',
  deleteFormTemplate: 'formTemplates',
  addFormSubmission: 'formSubmissions',
  deleteFormSubmission: 'formSubmissions',
  addIncident: 'incidents',
  updateIncident: 'incidents',
  markNotificationRead: 'notifications',
  addAvailabilityRequest: 'availabilityRequests',
  updateAvailabilityRequest: 'availabilityRequests',
};

export interface SchedulerHeaderDateNav {
  dateLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

interface AppContextType {
  currentPage: PageView;
  setCurrentPage: (page: PageView) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  isLoading: boolean;
  isDbConnected: boolean;
  realtimeConnected: boolean;
  pageDataReady: boolean;
  loadErrors: string[];
  retryFailed: () => Promise<void>;

  schedulerDateNav: SchedulerHeaderDateNav | null;
  setSchedulerDateNav: (v: SchedulerHeaderDateNav | null) => void;

  schedulerSearchQuery: string;
  setSchedulerSearchQuery: (q: string) => void;

  settings: CompanySettings;
  shifts: ShiftTemplate[];
  statusCatalog: StatusCatalogItem[];
  workOrderTypes: WorkOrderType[];
  projectTypes: ProjectType[];
  certifications: Certification[];
  skills: Skill[];
  workerRoles: WorkerRole[];
  workers: Worker[];
  equipment: Equipment[];
  materials: Material[];
  clients: Client[];
  projects: Project[];
  workOrders: WorkOrder[];
  commercialCatalogItems: CommercialCatalogItem[];
  commercialInvoices: CommercialInvoice[];
  commercialWorkOrders: CommercialWorkOrder[];
  timesheets: Timesheet[];
  pendingTimesheetsCount: number;
  formTemplates: FormTemplate[];
  formSubmissions: FormSubmission[];
  incidents: Incident[];
  notifications: Notification[];
  activityFeed: ActivityFeedItem[];
  availabilityRequests: AvailabilityRequest[];

  updateSettings: (s: Partial<CompanySettings>) => Promise<void>;
  addShift: (s: ShiftTemplate) => void;
  updateShift: (id: string, s: Partial<ShiftTemplate>) => void;
  deleteShift: (id: string) => void;
  addWorkOrderType: (wot: WorkOrderType) => void;
  updateWorkOrderType: (id: string, wot: Partial<WorkOrderType>) => void;
  deleteWorkOrderType: (id: string) => void;
  addProjectType: (pt: ProjectType) => void;
  updateProjectType: (id: string, pt: Partial<ProjectType>) => void;
  deleteProjectType: (id: string) => void;
  addStatusCatalogItem: (item: StatusCatalogItem) => void;
  updateStatusCatalogItem: (
    id: string,
    item: Partial<StatusCatalogItem>,
  ) => void;
  deleteStatusCatalogItem: (id: string) => void;
  addCertification: (item: Certification) => void;
  updateCertification: (id: string, item: Partial<Certification>) => void;
  deleteCertification: (id: string) => void;
  addSkill: (item: Skill) => void;
  updateSkill: (id: string, item: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  addWorkerRole: (item: WorkerRole) => void;
  updateWorkerRole: (id: string, item: Partial<WorkerRole>) => void;
  deleteWorkerRole: (id: string) => void;
  addWorker: (w: Worker) => void;
  updateWorker: (id: string, w: Partial<Worker>) => void;
  deleteWorker: (id: string) => void;
  addEquipment: (e: Equipment) => void;
  updateEquipment: (id: string, e: Partial<Equipment>) => void;
  deleteEquipment: (id: string) => Promise<void>;
  addMaterial: (m: Material) => void;
  updateMaterial: (id: string, m: Partial<Material>) => void;
  deleteMaterial: (id: string) => Promise<void>;
  deleteMaterials: (ids: string[]) => Promise<number>;
  addClient: (c: Client) => Promise<void>;
  updateClient: (id: string, c: Partial<Client>) => Promise<void>;
  addProject: (p: Project) => void;
  updateProject: (id: string, p: Partial<Project>) => void;
  addWorkOrder: (wo: WorkOrder) => void;
  updateWorkOrder: (id: string, wo: Partial<WorkOrder>, editedShiftIds?: string[]) => Promise<void>;
  deleteWorkOrder: (
    id: string,
  ) => Promise<{ success: boolean; trashed: boolean } | undefined>;
  restoreWorkOrder: (id: string) => Promise<WorkOrder | undefined>;
  addCommercialCatalogItem: (
    item: Parameters<typeof dbAddCommercialCatalogItem>[0],
  ) => Promise<CommercialCatalogItem | undefined>;
  updateCommercialCatalogItem: (
    id: string,
    item: Parameters<typeof dbUpdateCommercialCatalogItem>[1],
  ) => Promise<CommercialCatalogItem | undefined>;
  deleteCommercialCatalogItem: (id: string) => Promise<void>;
  addCommercialWorkOrder: (
    wo: Parameters<typeof dbAddCommercialWorkOrder>[0],
  ) => Promise<CommercialWorkOrder | undefined>;
  updateCommercialWorkOrder: (
    id: string,
    wo: Parameters<typeof dbUpdateCommercialWorkOrder>[1],
  ) => Promise<CommercialWorkOrder | undefined>;
  processCommercialWorkOrderOffRent: (
    id: string,
    payload: Parameters<typeof dbProcessCommercialWorkOrderOffRent>[1],
  ) => Promise<
    Awaited<ReturnType<typeof dbProcessCommercialWorkOrderOffRent>> | undefined
  >;
  generateCommercialInvoice: (
    workOrderId: string,
    payload: Parameters<typeof dbGenerateCommercialInvoice>[1],
  ) => Promise<CommercialInvoice | undefined>;
  addTimesheet: (t: Timesheet) => void;
  updateTimesheetStatus: (
    id: string,
    status: TimesheetStatus,
    reason?: string,
  ) => void;
  addFormTemplate: (ft: FormTemplate) => void;
  updateFormTemplate: (id: string, ft: Partial<FormTemplate>) => void;
  deleteFormTemplate: (id: string) => Promise<void>;
  addFormSubmission: (fs: FormSubmission) => void;
  deleteFormSubmission: (id: string) => Promise<void>;
  addIncident: (inc: Incident) => Promise<void>;
  updateIncident: (id: string, inc: Partial<Incident>) => Promise<void>;
  markNotificationRead: (id: string) => void;
  addAvailabilityRequest: (r: AvailabilityRequest) => Promise<void>;
  updateAvailabilityRequest: (
    id: string,
    r: Partial<AvailabilityRequest>,
  ) => Promise<void>;
  getWorkerById: (id: string) => Worker | undefined;
  getClientById: (id: string) => Client | undefined;
  getProjectById: (id: string) => Project | undefined;
}

const AppContext = createContext<AppContextType>({} as AppContextType);

export const useAppContext = () => useContext(AppContext);

const EMPTY_SETTINGS: CompanySettings = {
  name: '',
  address: '',
  phone: '',
  email: '',
  logo: '',
  logoIcon: '',
  overtimeRules: {
    id: 'default',
    name: 'Default Overtime',
    regularHoursLimit: 8,
    overtimeMultiplier: 1.5,
    doubleTimeThreshold: 12,
    doubleTimeMultiplier: 2.0,
    nightShiftPremium: 3,
    overtimeNightPremium: 4.5,
    doubleTimeNightPremium: 6,
    saturdayAllOvertime: true,
    saturdayDoubleTimeThreshold: 12,
    sundayAllDoubleTime: true,
    noLunchCreditEnabled: true,
    noLunchCreditMinimumHours: 7,
    noLunchCreditHours: 1,
    noLunchCreditTarget: 'ot',
    noLunchCreditEffectiveDate: '2026-07-08',
  },
  workerTypes: [],
  equipmentTypes: [],
  materialTypes: [],
  workOrderTypeOptions: [],
  jobStatuses: [],
  workOrderPdfBuilder: {
    version: 2,
    templateId: '',
    fields: {},
    layout: {
      accentColor: '#ed7376',
      workerRows: 7,
      materialRows: 13,
      filenameTemplate: '{projectNumber} - {projectName} - {materialTypes}',
      labels: {},
      sections: {},
    },
  },
  minimumRestHours: 8,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentPage, setCurrentPage] = useState<PageView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const {
    state: dataState,
    isLoading,
    isDbConnected,
    realtimeConnected,
    pageDataReady,
    loadErrors,
    retryFailed,
    refreshTable,
    resourceReady,
  } = useAppData(user?.id, currentPage);

  const [schedulerDateNav, setSchedulerDateNav] =
    useState<SchedulerHeaderDateNav | null>(null);
  const [schedulerSearchQuery, setSchedulerSearchQuery] = useState('');

  const [settings, setSettings] = dataState('settings', EMPTY_SETTINGS);
  const [shifts, setShifts] = dataState('shifts', []);
  const [workOrderTypes, setWorkOrderTypes] = dataState('workOrderTypes', []);
  const [projectTypes, setProjectTypes] = dataState('projectTypes', []);
  const [statusCatalog, setStatusCatalog] = dataState('statusCatalog', []);
  const [certifications, setCertifications] = dataState('certifications', []);
  const [skills, setSkills] = dataState('skills', []);
  const [workerRoles, setWorkerRoles] = dataState('workerRoles', []);
  const [workers, setWorkers] = dataState('workers', []);
  const [equipment, setEquipment] = dataState('equipment', []);
  const [materials, setMaterials] = dataState('materials', []);
  const [clients, setClients] = dataState('clients', []);
  const [projects, setProjects] = dataState('projects', []);
  const [workOrders, setWorkOrders] = dataState('workOrders', []);
  const [commercialCatalogItems, setCommercialCatalogItems] = dataState(
    'commercialCatalogItems',
    [],
  );
  const [commercialInvoices, setCommercialInvoices] = dataState(
    'commercialInvoices',
    [],
  );
  const [commercialWorkOrders, setCommercialWorkOrders] = dataState(
    'commercialWorkOrders',
    [],
  );
  const [timesheets, setTimesheets] = dataState('timesheets', []);
  const [timesheetSummary] = dataState('timesheetSummary', { pending: 0 });
  const pendingTimesheetsCount = PAGE_RESOURCES[currentPage].includes('timesheets')
    ? timesheets.filter((row) => row.status === 'pending').length
    : timesheetSummary.pending;
  const [formTemplates, setFormTemplates] = dataState('formTemplates', []);
  const [formSubmissions, setFormSubmissions] = dataState('formSubmissions', []);
  const [incidents, setIncidents] = dataState('incidents', []);
  const [notifications, setNotifications] = dataState('notifications', []);
  const [activityFeed, setActivityFeed] = dataState('activityFeed', []);
  const [availabilityRequests, setAvailabilityRequests] = dataState(
    'availabilityRequests',
    [],
  );

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const assignmentQueryClient = useQueryClient();

  const canMutate = useCallback(
    (actionName: string) => {
      if (
        user &&
        ACTION_RESOURCES[actionName] &&
        (resourceReady(ACTION_RESOURCES[actionName]) || (ACTION_RESOURCES[actionName] === 'workOrders' && hasAssignmentRead(assignmentQueryClient, user.id)))
      ) return true;
      console.warn(`[AppContext] Skipped ${actionName}: backend disconnected`);
      return false;
    },
    [user, resourceReady, assignmentQueryClient],
  );

  const updateSettings = useCallback(
    async (s: Partial<CompanySettings>) => {
      if (!canMutate('updateSettings')) {
        throw new Error('Backend disconnected');
      }
      const saved = await dbUpdateSettings(s);
      setSettings(saved);
    },
    [canMutate],
  );

  const addShift = useCallback(
    async (s: ShiftTemplate) => {
      if (!canMutate('addShift')) return;
      await dbAddShift(s);
      setShifts((prev) => [...prev, s]);
    },
    [canMutate],
  );

  const updateShift = useCallback(
    async (id: string, s: Partial<ShiftTemplate>) => {
      if (!canMutate('updateShift')) return;
      await dbUpdateShift(id, s);
      setShifts((prev) => prev.map((x) => (x.id === id ? { ...x, ...s } : x)));
    },
    [canMutate],
  );

  const deleteShift = useCallback(
    async (id: string) => {
      if (!canMutate('deleteShift')) return;
      await dbDeleteShift(id);
      setShifts((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addWorkOrderType = useCallback(
    async (wot: WorkOrderType) => {
      if (!canMutate('addWorkOrderType')) return;
      await dbAddWorkOrderType(wot);
      setWorkOrderTypes((prev) => [...prev, wot]);
    },
    [canMutate],
  );

  const updateWorkOrderType = useCallback(
    async (id: string, wot: Partial<WorkOrderType>) => {
      if (!canMutate('updateWorkOrderType')) return;
      await dbUpdateWorkOrderType(id, wot);
      setWorkOrderTypes((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...wot } : x)),
      );
    },
    [canMutate],
  );

  const deleteWorkOrderType = useCallback(
    async (id: string) => {
      if (!canMutate('deleteWorkOrderType')) return;
      await dbDeleteWorkOrderType(id);
      setWorkOrderTypes((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addProjectType = useCallback(
    async (pt: ProjectType) => {
      if (!canMutate('addProjectType')) return;
      await dbAddProjectType(pt);
      setProjectTypes((prev) => [...prev, pt]);
    },
    [canMutate],
  );

  const updateProjectType = useCallback(
    async (id: string, pt: Partial<ProjectType>) => {
      if (!canMutate('updateProjectType')) return;
      await dbUpdateProjectType(id, pt);
      setProjectTypes((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...pt } : x)),
      );
    },
    [canMutate],
  );

  const deleteProjectType = useCallback(
    async (id: string) => {
      if (!canMutate('deleteProjectType')) return;
      await dbDeleteProjectType(id);
      setProjectTypes((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addStatusCatalogItem = useCallback(
    async (item: StatusCatalogItem) => {
      if (!canMutate('addStatusCatalogItem')) return;
      await dbAddStatusCatalogItem(item);
      setStatusCatalog((prev) => [...prev, item]);
    },
    [canMutate],
  );

  const updateStatusCatalogItem = useCallback(
    async (id: string, item: Partial<StatusCatalogItem>) => {
      if (!canMutate('updateStatusCatalogItem')) return;
      await dbUpdateStatusCatalogItem(id, item);
      setStatusCatalog((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...item } : x)),
      );
    },
    [canMutate],
  );

  const deleteStatusCatalogItem = useCallback(
    async (id: string) => {
      if (!canMutate('deleteStatusCatalogItem')) return;
      await dbDeleteStatusCatalogItem(id);
      setStatusCatalog((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addCertification = useCallback(
    async (item: Certification) => {
      if (!canMutate('addCertification')) return;
      await dbAddCertification(item);
      setCertifications((prev) => [...prev, item]);
    },
    [canMutate],
  );

  const updateCertification = useCallback(
    async (id: string, item: Partial<Certification>) => {
      if (!canMutate('updateCertification')) return;
      await dbUpdateCertification(id, item);
      setCertifications((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...item } : x)),
      );
    },
    [canMutate],
  );

  const deleteCertification = useCallback(
    async (id: string) => {
      if (!canMutate('deleteCertification')) return;
      await dbDeleteCertification(id);
      setCertifications((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addSkill = useCallback(
    async (item: Skill) => {
      if (!canMutate('addSkill')) return;
      await dbAddSkill(item);
      setSkills((prev) => [...prev, item]);
    },
    [canMutate],
  );

  const updateSkill = useCallback(
    async (id: string, item: Partial<Skill>) => {
      if (!canMutate('updateSkill')) return;
      await dbUpdateSkill(id, item);
      setSkills((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...item } : x)),
      );
    },
    [canMutate],
  );

  const deleteSkill = useCallback(
    async (id: string) => {
      if (!canMutate('deleteSkill')) return;
      await dbDeleteSkill(id);
      setSkills((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addWorkerRole = useCallback(
    async (item: WorkerRole) => {
      if (!canMutate('addWorkerRole')) return;
      await dbAddWorkerRole(item);
      setWorkerRoles((prev) => [...prev, item]);
    },
    [canMutate],
  );

  const updateWorkerRole = useCallback(
    async (id: string, item: Partial<WorkerRole>) => {
      if (!canMutate('updateWorkerRole')) return;
      await dbUpdateWorkerRole(id, item);
      setWorkerRoles((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...item } : x)),
      );
    },
    [canMutate],
  );

  const deleteWorkerRole = useCallback(
    async (id: string) => {
      if (!canMutate('deleteWorkerRole')) return;
      await dbDeleteWorkerRole(id);
      setWorkerRoles((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addWorker = useCallback(
    async (w: Worker) => {
      if (!canMutate('addWorker')) return;
      const saved = await dbAddWorker(w);
      setWorkers((prev) => [...prev, saved]);
    },
    [canMutate],
  );

  const updateWorker = useCallback(
    async (id: string, w: Partial<Worker>) => {
      if (!canMutate('updateWorker')) return;
      const saved = await dbUpdateWorker(id, w);
      setWorkers((prev) => prev.map((x) => (x.id === id ? saved : x)));
    },
    [canMutate],
  );

  const deleteWorker = useCallback(
    async (id: string) => {
      if (!canMutate('deleteWorker')) return;
      await dbDeleteWorker(id);
      setWorkers((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addEquipment = useCallback(
    async (e: Equipment) => {
      if (!canMutate('addEquipment')) return;
      await dbAddEquipment(e);
      setEquipment((prev) => [...prev, e]);
    },
    [canMutate],
  );

  const updateEquipment = useCallback(
    async (id: string, e: Partial<Equipment>) => {
      if (!canMutate('updateEquipment')) return;
      await dbUpdateEquipment(id, e);
      setEquipment((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...e } : x)),
      );
    },
    [canMutate],
  );

  const deleteEquipment = useCallback(
    async (id: string) => {
      if (!canMutate('deleteEquipment')) return;
      await dbDeleteEquipment(id);
      setEquipment((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addMaterial = useCallback(
    async (m: Material) => {
      if (!canMutate('addMaterial')) return;
      await dbAddMaterial(m);
      setMaterials((prev) => [...prev, m]);
    },
    [canMutate],
  );

  const updateMaterial = useCallback(
    async (id: string, m: Partial<Material>) => {
      if (!canMutate('updateMaterial')) return;
      await dbUpdateMaterial(id, m);
      setMaterials((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...m } : x)),
      );
    },
    [canMutate],
  );

  const deleteMaterial = useCallback(
    async (id: string) => {
      if (!canMutate('deleteMaterial')) return;
      await dbDeleteMaterial(id);
      setMaterials((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const deleteMaterials = useCallback(
    async (ids: string[]) => {
      if (!canMutate('deleteMaterial'))
        throw new Error('You do not have permission to delete materials.');
      const result = await dbDeleteMaterials(ids);
      const removed = new Set(ids);
      setMaterials((prev) => prev.filter((item) => !removed.has(item.id)));
      return result.deletedCount;
    },
    [canMutate],
  );

  const addClient = useCallback(
    async (c: Client) => {
      if (!canMutate('addClient')) return;
      await dbAddClient(c);
      setClients((prev) => [...prev, c]);
    },
    [canMutate],
  );

  const updateClient = useCallback(
    async (id: string, c: Partial<Client>) => {
      if (!canMutate('updateClient')) return;
      await dbUpdateClient(id, c);
      setClients((prev) => prev.map((x) => (x.id === id ? { ...x, ...c } : x)));
    },
    [canMutate],
  );

  const addProject = useCallback(
    async (p: Project) => {
      if (!canMutate('addProject')) return;
      await dbAddProject(p);
      setProjects((prev) => [...prev, p]);
    },
    [canMutate],
  );

  const updateProject = useCallback(
    async (id: string, p: Partial<Project>) => {
      if (!canMutate('updateProject')) return;
      const saved = await dbUpdateProject(id, p);
      setProjects((prev) => prev.map((x) => (x.id === id ? saved : x)));
    },
    [canMutate],
  );

  const addWorkOrder = useCallback(
    async (wo: WorkOrder) => {
      if (!canMutate('addWorkOrder')) {
        throw new Error('Not connected to the server');
      }
      const saved = await dbAddWorkOrder(wo);
      setWorkOrders((prev) => {
        const idx = prev.findIndex((x) => x.id === saved.id);
        if (idx === -1) return [...prev, saved];
        const next = [...prev];
        next[idx] = saved;
        return next;
      });
    },
    [canMutate],
  );

  const updateWorkOrder = useCallback(
    async (id: string, wo: Partial<WorkOrder>, editedShiftIds?: string[]) => {
      if (!canMutate('updateWorkOrder')) return;
      const payload: Partial<WorkOrder> = { ...wo };
      if (payload.status !== undefined && payload.status !== 'cancelled') {
        delete payload.status;
      }
      const previous = completeAssignmentSnapshot(assignmentQueryClient, user?.id || 'guest', id) ?? workOrders.find((order) => order.id === id) ?? (payload.shifts ? await fetchAssignmentRecord(id) : undefined);
      const changedShiftIds = editedShiftIds ?? (payload.shifts && previous
        ? payload.shifts
            .filter((shift) => {
              const original = previous.shifts.find((item) => item.id === shift.id);
              return JSON.stringify(original) !== JSON.stringify(shift);
            })
            .map((shift) => shift.id)
        : undefined);
      const saved = await dbUpdateWorkOrder(id, { ...payload, changedShiftIds });
      if (saved) {
        setWorkOrders((prev) => prev.map((x) => (x.id === id ? saved : x)));
      } else {
        setWorkOrders((prev) =>
          prev.map((x) => (x.id === id ? { ...x, ...payload } : x)),
        );
      }
    },
    [canMutate, workOrders, assignmentQueryClient, user?.id],
  );

  const deleteWorkOrder = useCallback(
    async (id: string) => {
      if (!canMutate('deleteWorkOrder')) return;
      const result = await dbDeleteWorkOrder(id);
      setWorkOrders((prev) => prev.filter((x) => x.id !== id));
      return result;
    },
    [canMutate],
  );

  const restoreWorkOrder = useCallback(
    async (id: string) => {
      if (!canMutate('restoreWorkOrder')) return undefined;
      const restored = await dbRestoreWorkOrder(id);
      setWorkOrders((prev) => [
        restored,
        ...prev.filter((item) => item.id !== restored.id),
      ]);
      return restored;
    },
    [canMutate],
  );

  const addCommercialCatalogItem = useCallback(
    async (item: Parameters<typeof dbAddCommercialCatalogItem>[0]) => {
      if (!canMutate('addCommercialCatalogItem')) return undefined;
      const saved = await dbAddCommercialCatalogItem(item);
      setCommercialCatalogItems((prev) =>
        [...prev.filter((x) => x.id !== saved.id), saved].sort((a, b) =>
          a.sku.localeCompare(b.sku),
        ),
      );
      return saved;
    },
    [canMutate],
  );

  const updateCommercialCatalogItem = useCallback(
    async (
      id: string,
      item: Parameters<typeof dbUpdateCommercialCatalogItem>[1],
    ) => {
      if (!canMutate('updateCommercialCatalogItem')) return undefined;
      const saved = await dbUpdateCommercialCatalogItem(id, item);
      setCommercialCatalogItems((prev) =>
        prev
          .map((x) => (x.id === id ? saved : x))
          .sort((a, b) => a.sku.localeCompare(b.sku)),
      );
      return saved;
    },
    [canMutate],
  );

  const deleteCommercialCatalogItem = useCallback(
    async (id: string) => {
      if (!canMutate('deleteCommercialCatalogItem')) return;
      await dbDeleteCommercialCatalogItem(id);
      setCommercialCatalogItems((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addCommercialWorkOrder = useCallback(
    async (wo: Parameters<typeof dbAddCommercialWorkOrder>[0]) => {
      if (!canMutate('addCommercialWorkOrder')) return undefined;
      const saved = await dbAddCommercialWorkOrder(wo);
      setCommercialWorkOrders((prev) => [
        saved,
        ...prev.filter((item) => item.id !== saved.id),
      ]);
      return saved;
    },
    [canMutate],
  );

  const updateCommercialWorkOrder = useCallback(
    async (
      id: string,
      wo: Parameters<typeof dbUpdateCommercialWorkOrder>[1],
    ) => {
      if (!canMutate('updateCommercialWorkOrder')) return undefined;
      const saved = await dbUpdateCommercialWorkOrder(id, wo);
      setCommercialWorkOrders((prev) =>
        prev.map((item) => (item.id === id ? saved : item)),
      );
      return saved;
    },
    [canMutate],
  );

  const processCommercialWorkOrderOffRent = useCallback(
    async (
      id: string,
      payload: Parameters<typeof dbProcessCommercialWorkOrderOffRent>[1],
    ) => {
      if (!canMutate('processCommercialWorkOrderOffRent')) return undefined;
      const result = await dbProcessCommercialWorkOrderOffRent(id, payload);
      setCommercialWorkOrders((prev) => {
        const withoutTouched = prev.filter(
          (item) =>
            item.id !== result.original.id && item.id !== result.rollover?.id,
        );
        return [result.rollover, result.original, ...withoutTouched].filter(
          (item): item is CommercialWorkOrder => Boolean(item),
        );
      });
      return result;
    },
    [canMutate],
  );

  const generateCommercialInvoice = useCallback(
    async (
      workOrderId: string,
      payload: Parameters<typeof dbGenerateCommercialInvoice>[1],
    ) => {
      if (!canMutate('generateCommercialInvoice')) return undefined;
      const saved = await dbGenerateCommercialInvoice(workOrderId, payload);
      setCommercialInvoices((prev) => [
        saved,
        ...prev.filter((item) => item.id !== saved.id),
      ]);
      await refreshTable('commercial_work_orders');
      return saved;
    },
    [canMutate, refreshTable],
  );

  const addTimesheet = useCallback(
    async (t: Timesheet) => {
      if (!canMutate('addTimesheet')) return;
      await dbAddTimesheet(t);
      setTimesheets((prev) => [...prev, t]);
    },
    [canMutate],
  );

  const updateTimesheetStatus = useCallback(
    async (id: string, status: TimesheetStatus, reason?: string) => {
      if (!canMutate('updateTimesheetStatus')) return;
      await dbUpdateTimesheetStatus(id, status, reason);
      setTimesheets((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, status, rejectedReason: reason || x.rejectedReason }
            : x,
        ),
      );
    },
    [canMutate],
  );

  const addFormTemplate = useCallback(
    async (ft: FormTemplate) => {
      if (!canMutate('addFormTemplate')) return;
      await dbAddFormTemplate(ft);
      setFormTemplates((prev) => [...prev, ft]);
    },
    [canMutate],
  );

  const updateFormTemplate = useCallback(
    async (id: string, ft: Partial<FormTemplate>) => {
      if (!canMutate('updateFormTemplate')) return;
      await dbUpdateFormTemplate(id, ft);
      setFormTemplates((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...ft } : x)),
      );
    },
    [canMutate],
  );

  const deleteFormTemplate = useCallback(
    async (id: string) => {
      if (!canMutate('deleteFormTemplate')) return;
      await dbDeleteFormTemplate(id);
      setFormTemplates((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addFormSubmission = useCallback(
    async (fs: FormSubmission) => {
      if (!canMutate('addFormSubmission')) return;
      const saved = await dbAddFormSubmission(fs);
      setFormSubmissions((prev) => [
        ...prev.filter((item) => item.id !== saved.id),
        saved,
      ]);
      const template = formTemplates.find(
        (item) => item.id === saved.templateId,
      );
      const isIncident = [template?.category, template?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes('incident'));
      const isTimesheet = [template?.category, template?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes('timesheet'));
      if (isIncident) {
        await refreshTable('incidents');
      }
      if (isTimesheet) {
        await refreshTable('timesheets');
      }
    },
    [canMutate, formTemplates, refreshTable],
  );

  const deleteFormSubmission = useCallback(
    async (id: string) => {
      if (!canMutate('deleteFormSubmission')) return;
      await dbDeleteFormSubmission(id);
      setFormSubmissions((prev) => prev.filter((x) => x.id !== id));
    },
    [canMutate],
  );

  const addIncident = useCallback(
    async (inc: Incident) => {
      if (!canMutate('addIncident')) return;
      await dbAddIncident(inc);
      setIncidents((prev) => [...prev, inc]);
    },
    [canMutate],
  );

  const updateIncident = useCallback(
    async (id: string, inc: Partial<Incident>) => {
      if (!canMutate('updateIncident')) return;
      await dbUpdateIncident(id, inc);
      setIncidents((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...inc } : x)),
      );
    },
    [canMutate],
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!canMutate('markNotificationRead')) return;
      await dbMarkNotificationRead(id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === id ? { ...x, read: true } : x)),
      );
    },
    [canMutate],
  );

  const addAvailabilityRequest = useCallback(
    async (r: AvailabilityRequest) => {
      if (!canMutate('addAvailabilityRequest')) return;
      await dbAddAvailabilityRequest(r);
      setAvailabilityRequests((prev) => [...prev, r]);
    },
    [canMutate],
  );

  const updateAvailabilityRequest = useCallback(
    async (id: string, r: Partial<AvailabilityRequest>) => {
      if (!canMutate('updateAvailabilityRequest')) return;
      await dbUpdateAvailabilityRequest(id, r);
      setAvailabilityRequests((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...r } : x)),
      );
    },
    [canMutate],
  );

  const getWorkerById = useCallback(
    (id: string) => workers.find((w) => w.id === id),
    [workers],
  );
  const getClientById = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  );
  const getProjectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  return (
    <AppContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        sidebarOpen,
        toggleSidebar,
        sidebarCollapsed,
        setSidebarCollapsed,
        isLoading,
        isDbConnected,
        realtimeConnected,
        pageDataReady,
        loadErrors,
        retryFailed,
        schedulerDateNav,
        setSchedulerDateNav,
        schedulerSearchQuery,
        setSchedulerSearchQuery,
        settings,
        shifts,
        statusCatalog,
        workOrderTypes,
        projectTypes,
        certifications,
        skills,
        workerRoles,
        workers,
        equipment,
        materials,
        clients,
        projects,
        workOrders,
        commercialCatalogItems,
        commercialInvoices,
        commercialWorkOrders,
        timesheets,
        pendingTimesheetsCount,
        formTemplates,
        formSubmissions,
        incidents,
        notifications,
        activityFeed,
        availabilityRequests,
        updateSettings,
        addShift,
        updateShift,
        deleteShift,
        addWorkOrderType,
        updateWorkOrderType,
        deleteWorkOrderType,
        addProjectType,
        updateProjectType,
        deleteProjectType,
        addStatusCatalogItem,
        updateStatusCatalogItem,
        deleteStatusCatalogItem,
        addCertification,
        updateCertification,
        deleteCertification,
        addSkill,
        updateSkill,
        deleteSkill,
        addWorkerRole,
        updateWorkerRole,
        deleteWorkerRole,
        addWorker,
        updateWorker,
        deleteWorker,
        addEquipment,
        updateEquipment,
        deleteEquipment,
        addClient,
        updateClient,
        addMaterial,
        updateMaterial,
        deleteMaterial,
        deleteMaterials,
        addProject,
        updateProject,
        addWorkOrder,
        updateWorkOrder,
        deleteWorkOrder,
        restoreWorkOrder,
        addCommercialCatalogItem,
        updateCommercialCatalogItem,
        deleteCommercialCatalogItem,
        addCommercialWorkOrder,
        updateCommercialWorkOrder,
        processCommercialWorkOrderOffRent,
        generateCommercialInvoice,
        addTimesheet,
        updateTimesheetStatus,
        addFormTemplate,
        updateFormTemplate,
        deleteFormTemplate,
        addFormSubmission,
        deleteFormSubmission,
        addIncident,
        updateIncident,
        markNotificationRead,
        addAvailabilityRequest,
        updateAvailabilityRequest,
        getWorkerById,
        getClientById,
        getProjectById,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};


// Scoped list data is supplied only to that list's existing dialogs. It never
// replaces the complete collections used by Schedule or other modules.
export function AppContextOverride({ value, children }: { value: Partial<AppContextType>; children: React.ReactNode }) {
  const parent = useAppContext();
  return <AppContext.Provider value={{ ...parent, ...value }}>{children}</AppContext.Provider>;
}
