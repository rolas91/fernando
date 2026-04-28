import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { CompanySettings } from '../entities/company-settings.entity';
import { Shift } from '../entities/shift.entity';
import { StatusCatalog } from '../entities/status-catalog.entity';
import { User } from '../entities/user.entity';
import { WorkOrderType } from '../entities/work-order-type.entity';
import { AccessService } from '../modules/access/services/access.service';

const SALT_ROUNDS = 10;

type Role = 'admin' | 'manager' | 'scheduler' | 'viewer';

type SeedUser = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
};

const DEFAULT_SETTINGS: Pick<
  CompanySettings,
  | 'id'
  | 'name'
  | 'address'
  | 'phone'
  | 'email'
  | 'logo'
  | 'overtimeRules'
  | 'workerTypes'
  | 'equipmentTypes'
  | 'jobStatuses'
> = {
  id: 'default',
  name: 'DR Traffic Control, LLC',
  address: '1366 Palou Ave, Unit A, San Francisco, CA 94124',
  phone: '415-641-4416',
  email: 'info@drtrafficcontrol.com',
  logo: null,
  overtimeRules: {
    id: '1',
    name: 'California Overtime',
    regularHoursLimit: 8,
    overtimeMultiplier: 1.5,
    doubleTimeThreshold: 12,
    doubleTimeMultiplier: 2.0,
  },
  workerTypes: [
    'Foreman',
    'Flagger',
    'Traffic Controller',
    'Machine Operator',
    'General Laborer',
    'Truck Driver',
  ],
  equipmentTypes: [
    'Arrow Board',
    'Message Board',
    'Truck',
    'Cone Set',
    'Barricade Set',
    'Light Tower',
    'Generator',
    'CMS Mini',
  ],
  jobStatuses: [
    'Pending',
    'Confirmed',
    'In Progress',
    'Completed',
    'Cancelled',
  ],
};

const DEFAULT_SHIFTS: Array<
  Pick<
    Shift,
    'id' | 'name' | 'type' | 'startTime' | 'endTime' | 'durationHours' | 'status'
  >
> = [
  {
    id: 'shift_day',
    name: 'Day Shift',
    type: 'standard',
    startTime: '07:00',
    endTime: '16:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_night',
    name: 'Night Shift',
    type: 'standard',
    startTime: '19:00',
    endTime: '04:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_swing',
    name: 'Swing Shift',
    type: 'standard',
    startTime: '15:00',
    endTime: '00:00',
    durationHours: 9,
    status: 'active',
  },
  {
    id: 'shift_on_call',
    name: 'On Call',
    type: 'on_call',
    startTime: null,
    endTime: null,
    durationHours: null,
    status: 'active',
  },
  {
    id: 'shift_weekend',
    name: 'Weekend Shift',
    type: 'temporary',
    startTime: '06:00',
    endTime: '14:00',
    durationHours: 8,
    status: 'inactive',
  },
];

const DEFAULT_WORK_ORDER_TYPES: Array<
  Pick<WorkOrderType, 'id' | 'name' | 'description' | 'status'>
> = [
  {
    id: 'wot_traffic_control',
    name: 'Traffic Control',
    description: 'General traffic control scope',
    status: 'active',
  },
  {
    id: 'wot_lane_closure',
    name: 'Lane Closure',
    description: 'Single or multi-lane closure operations',
    status: 'active',
  },
  {
    id: 'wot_emergency_response',
    name: 'Emergency Response',
    description: 'Rapid-response traffic support for incidents',
    status: 'active',
  },
  {
    id: 'wot_flagging_operation',
    name: 'Flagging Operation',
    description: 'Flagger-led traffic management operation',
    status: 'active',
  },
  {
    id: 'wot_night_shift_support',
    name: 'Night Shift Support',
    description: 'Night operations and overnight coverage',
    status: 'active',
  },
];

const DEFAULT_STATUS_CATALOG: Array<
  Pick<
    StatusCatalog,
    | 'id'
    | 'scope'
    | 'value'
    | 'name'
    | 'color'
    | 'sortOrder'
    | 'blocksEditing'
    | 'triggersNotification'
    | 'requiresApproval'
    | 'status'
  >
> = [
  {
    id: 'wo_draft',
    scope: 'work_order',
    value: 'draft',
    name: 'Draft',
    color: '#94A3B8',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_scheduled',
    scope: 'work_order',
    value: 'scheduled',
    name: 'Scheduled',
    color: '#3B82F6',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_assigned',
    scope: 'work_order',
    value: 'assigned',
    name: 'Assigned',
    color: '#6366F1',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_in_progress',
    scope: 'work_order',
    value: 'in_progress',
    name: 'In Progress',
    color: '#0EA5E9',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_completed',
    scope: 'work_order',
    value: 'completed',
    name: 'Completed',
    color: '#22C55E',
    sortOrder: 50,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'wo_approved',
    scope: 'work_order',
    value: 'approved',
    name: 'Approved',
    color: '#16A34A',
    sortOrder: 60,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_closed',
    scope: 'work_order',
    value: 'closed',
    name: 'Closed',
    color: '#334155',
    sortOrder: 70,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'wo_cancelled',
    scope: 'work_order',
    value: 'cancelled',
    name: 'Cancelled',
    color: '#EF4444',
    sortOrder: 80,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ts_pending',
    scope: 'timesheet',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_submitted',
    scope: 'timesheet',
    value: 'submitted',
    name: 'Submitted',
    color: '#3B82F6',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_reviewed',
    scope: 'timesheet',
    value: 'reviewed',
    name: 'Reviewed',
    color: '#8B5CF6',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ts_approved',
    scope: 'timesheet',
    value: 'approved',
    name: 'Approved',
    color: '#22C55E',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ts_rejected',
    scope: 'timesheet',
    value: 'rejected',
    name: 'Rejected',
    color: '#EF4444',
    sortOrder: 50,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_pending',
    scope: 'project',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_confirmed',
    scope: 'project',
    value: 'confirmed',
    name: 'Confirmed',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_in_progress',
    scope: 'project',
    value: 'in_progress',
    name: 'In Progress',
    color: '#3B82F6',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_completed',
    scope: 'project',
    value: 'completed',
    name: 'Completed',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'pj_cancelled',
    scope: 'project',
    value: 'cancelled',
    name: 'Cancelled',
    color: '#EF4444',
    sortOrder: 50,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'eq_available',
    scope: 'equipment',
    value: 'available',
    name: 'Available',
    color: '#22C55E',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'eq_assigned',
    scope: 'equipment',
    value: 'assigned',
    name: 'Assigned',
    color: '#F59E0B',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'eq_maintenance',
    scope: 'equipment',
    value: 'maintenance',
    name: 'Maintenance',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'eq_retired',
    scope: 'equipment',
    value: 'retired',
    name: 'Retired',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ar_pending',
    scope: 'availability_request',
    value: 'pending',
    name: 'Pending',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'ar_approved',
    scope: 'availability_request',
    value: 'approved',
    name: 'Approved',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ar_denied',
    scope: 'availability_request',
    value: 'denied',
    name: 'Denied',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: true,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_open',
    scope: 'incident',
    value: 'open',
    name: 'Open',
    color: '#EF4444',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_investigating',
    scope: 'incident',
    value: 'investigating',
    name: 'Investigating',
    color: '#F59E0B',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_resolved',
    scope: 'incident',
    value: 'resolved',
    name: 'Resolved',
    color: '#22C55E',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'ic_closed',
    scope: 'incident',
    value: 'closed',
    name: 'Closed',
    color: '#6B7280',
    sortOrder: 40,
    blocksEditing: true,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'fs_submitted',
    scope: 'form_submission',
    value: 'submitted',
    name: 'Submitted',
    color: '#F59E0B',
    sortOrder: 10,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
  {
    id: 'fs_reviewed',
    scope: 'form_submission',
    value: 'reviewed',
    name: 'Reviewed',
    color: '#22C55E',
    sortOrder: 20,
    blocksEditing: false,
    triggersNotification: false,
    requiresApproval: false,
    status: 'active',
  },
  {
    id: 'fs_flagged',
    scope: 'form_submission',
    value: 'flagged',
    name: 'Flagged',
    color: '#EF4444',
    sortOrder: 30,
    blocksEditing: false,
    triggersNotification: true,
    requiresApproval: true,
    status: 'active',
  },
];

function asBoolean(input: string | undefined, fallback: boolean) {
  if (!input) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(input.toLowerCase());
}

function mergeUnique(current: string[] = [], incoming: string[] = []) {
  return Array.from(new Set([...current, ...incoming]));
}

function getSeedUsers(): SeedUser[] {
  return [
    {
      firstName: 'Derek',
      lastName: 'Doan',
      email: process.env.SEED_ADMIN_EMAIL || 'derek@drtrafficcontrol.com',
      phone: '(555) 100-0001',
      role: 'admin',
      password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    },
    {
      firstName: 'Sarah',
      lastName: 'Mitchell',
      email: process.env.SEED_MANAGER_EMAIL || 'sarah@drtrafficcontrol.com',
      phone: '(555) 100-0002',
      role: 'manager',
      password: process.env.SEED_MANAGER_PASSWORD || 'manager123',
    },
    {
      firstName: 'Mike',
      lastName: 'Rodriguez',
      email: process.env.SEED_SCHEDULER_EMAIL || 'mike@drtrafficcontrol.com',
      phone: '(555) 100-0003',
      role: 'scheduler',
      password: process.env.SEED_SCHEDULER_PASSWORD || 'scheduler123',
    },
    {
      firstName: 'Jenny',
      lastName: 'Park',
      email: process.env.SEED_VIEWER_EMAIL || 'jenny@drtrafficcontrol.com',
      phone: '(555) 100-0004',
      role: 'viewer',
      password: process.env.SEED_VIEWER_PASSWORD || 'viewer123',
    },
  ];
}

async function seedCatalogs(dataSource: DataSource) {
  const settingsRepo = dataSource.getRepository(CompanySettings);
  const existing = await settingsRepo.findOne({
    where: { id: DEFAULT_SETTINGS.id },
  });

  if (!existing) {
    await settingsRepo.save(settingsRepo.create(DEFAULT_SETTINGS));
    console.log('Catalog seed OK. Created company_settings default.');
    return;
  }

  existing.workerTypes = mergeUnique(
    existing.workerTypes,
    DEFAULT_SETTINGS.workerTypes,
  );
  existing.equipmentTypes = mergeUnique(
    existing.equipmentTypes,
    DEFAULT_SETTINGS.equipmentTypes,
  );
  existing.jobStatuses = mergeUnique(
    existing.jobStatuses,
    DEFAULT_SETTINGS.jobStatuses,
  );
  existing.overtimeRules =
    existing.overtimeRules || DEFAULT_SETTINGS.overtimeRules;
  existing.name = existing.name || DEFAULT_SETTINGS.name;
  existing.address = existing.address || DEFAULT_SETTINGS.address;
  existing.phone = existing.phone || DEFAULT_SETTINGS.phone;
  existing.email = existing.email || DEFAULT_SETTINGS.email;
  existing.logo = existing.logo ?? DEFAULT_SETTINGS.logo;

  await settingsRepo.save(existing);
  console.log('Catalog seed OK. Updated company_settings default.');
}

async function seedShiftCatalog(dataSource: DataSource) {
  const shiftRepo = dataSource.getRepository(Shift);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_SHIFTS) {
    const existing = await shiftRepo.findOne({ where: { id: template.id } });
    if (!existing) {
      await shiftRepo.save(shiftRepo.create(template));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.type = template.type;
    existing.startTime = template.startTime;
    existing.endTime = template.endTime;
    existing.durationHours = template.durationHours;
    existing.status = template.status;
    await shiftRepo.save(existing);
    updated += 1;
  }

  console.log(`Shifts seed OK. created=${created}, updated=${updated}`);
}

async function seedWorkOrderTypeCatalog(dataSource: DataSource) {
  const repo = dataSource.getRepository(WorkOrderType);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_WORK_ORDER_TYPES) {
    const existing = await repo.findOne({ where: { id: template.id } });
    if (!existing) {
      await repo.save(repo.create(template));
      created += 1;
      continue;
    }

    existing.name = template.name;
    existing.description = template.description;
    existing.status = template.status;
    await repo.save(existing);
    updated += 1;
  }

  console.log(
    `Work order types seed OK. created=${created}, updated=${updated}`,
  );
}

async function seedStatusCatalog(dataSource: DataSource) {
  const repo = dataSource.getRepository(StatusCatalog);
  let created = 0;
  let updated = 0;

  for (const template of DEFAULT_STATUS_CATALOG) {
    const existing = await repo.findOne({ where: { id: template.id } });

    if (!existing) {
      await repo.save(repo.create(template));
      created += 1;
      continue;
    }

    existing.value = template.value;
    existing.name = template.name;
    existing.color = template.color;
    existing.sortOrder = template.sortOrder;
    existing.blocksEditing = template.blocksEditing;
    existing.triggersNotification = template.triggersNotification;
    existing.requiresApproval = template.requiresApproval;
    existing.status = template.status;
    await repo.save(existing);
    updated += 1;
  }

  console.log(`Status catalog seed OK. created=${created}, updated=${updated}`);
}

async function seedUsers(dataSource: DataSource, accessService: AccessService) {
  const resetPasswords = asBoolean(
    process.env.SEED_USERS_RESET_PASSWORDS,
    false,
  );
  const usersRepo = dataSource.getRepository(User);
  const users = getSeedUsers();

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const existing = await usersRepo.findOne({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      const createdUser = await usersRepo.save(
        usersRepo.create({
          email,
          passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          avatarUrl: null,
          status: 'active',
          lastLogin: null,
        }),
      );
      await accessService.replaceAppRoleForUser(createdUser.id, user.role);
      created += 1;
      continue;
    }

    existing.firstName = user.firstName;
    existing.lastName = user.lastName;
    existing.phone = user.phone;
    existing.status = existing.status || 'active';

    if (resetPasswords) {
      existing.passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
    }

    const saved = await usersRepo.save(existing);
    await accessService.replaceAppRoleForUser(saved.id, user.role);
    updated += 1;
  }

  console.log(
    `Users seed OK. created=${created}, updated=${updated}, resetPasswords=${resetPasswords}`,
  );
}

async function seedDr() {
  ensureRuntimeEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const accessService = app.get(AccessService);
    await seedCatalogs(dataSource);
    await seedShiftCatalog(dataSource);
    await seedWorkOrderTypeCatalog(dataSource);
    await seedStatusCatalog(dataSource);
    await seedUsers(dataSource, accessService);
    console.log('Seed DR OK.');
  } finally {
    await app.close();
  }
}

seedDr().catch((err) => {
  console.error(err);
  process.exit(1);
});
