import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { CompanySettings } from '../entities/company-settings.entity';
import { UserProfile } from '../entities/user-profile.entity';

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

async function seedUsers(dataSource: DataSource) {
  const resetPasswords = asBoolean(
    process.env.SEED_USERS_RESET_PASSWORDS,
    false,
  );
  const usersRepo = dataSource.getRepository(UserProfile);
  const users = getSeedUsers();

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const existing = await usersRepo.findOne({ where: { email } });

    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      await usersRepo.save(
        usersRepo.create({
          id: randomUUID(),
          email,
          passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          phone: user.phone,
          status: 'active',
          lastLogin: null,
        }),
      );
      created += 1;
      continue;
    }

    existing.firstName = user.firstName;
    existing.lastName = user.lastName;
    existing.role = user.role;
    existing.phone = user.phone;
    existing.status = existing.status || 'active';

    if (resetPasswords) {
      existing.passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
    }

    await usersRepo.save(existing);
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
    await seedCatalogs(dataSource);
    await seedUsers(dataSource);
    console.log('Seed DR OK.');
  } finally {
    await app.close();
  }
}

seedDr().catch((err) => {
  console.error(err);
  process.exit(1);
});
