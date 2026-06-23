import { AppDataSource } from '../data-source';

function getKeys(value: any, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const childKeys = value.flatMap((v: any) => getKeys(v, prefix));
    return Array.from(new Set(childKeys));
  }
  if (typeof value === 'object') {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      keys.push(path);
      keys.push(...getKeys(v, path));
    }
    return keys;
  }
  return [prefix];
}

const json: any[] = [
  {
    id: 's_demo_1',
    date: '2026-06-22',
    roles: [
      {
        id: 'r_demo_1_flagger',
        roleName: 'Flagger',
        startTime: '07:00',
        requiredCount: 2,
        assignedWorkers: ['wkr_demo_fernando', 'wkr_demo_rolando'],
        requiredSkillIds: [],
        assignedEquipment: ['eq_demo_cone'],
        assignedMaterials: ['mat_demo_sign'],
        workerConfirmations: [
          {
            status: 'confirmed',
            workerId: 'wkr_demo_fernando',
            respondedAt: '2026-06-21T15:00:00.000Z',
            notificationChannel: 'sms',
          },
          { status: 'pending', workerId: 'wkr_demo_rolando' },
        ],
        requiredCertificationIds: [],
      },
    ],
    endTime: '15:30',
    startTime: '07:00',
    shiftTemplateId: 'shift_day',
    defaultRoleStartTime: '07:00',
  },
];

const tables: any[] = [
  {
    id: 's_demo_1',
    workOrderId: 'wo_demo_asn_2026_856',
    date: '2026-06-22',
    startTime: '07:00',
    endTime: '15:30',
    defaultRoleStartTime: '07:00',
    shiftTemplateId: 'shift_day',
    roles: [
      {
        id: 'r_demo_1_flagger',
        roleName: 'Flagger',
        requiredCount: 2,
        startTime: '07:00',
        requiredCertificationIds: [],
        requiredSkillIds: [],
        assignedWorkers: ['wkr_demo_fernando', 'wkr_demo_rolando'],
        assignedEquipment: ['eq_demo_cone'],
        assignedMaterials: ['mat_demo_sign'],
        workerConfirmations: [
          {
            workerId: 'wkr_demo_fernando',
            status: 'confirmed',
            respondedAt: '2026-06-21T15:00:00.000Z',
            notificationChannel: 'sms',
          },
          { workerId: 'wkr_demo_rolando', status: 'pending' },
        ],
      },
    ],
  },
];

const jsonKeys = new Set(getKeys(json));
const tblKeys = new Set(getKeys(tables));

const onlyJson = [...jsonKeys].filter((k) => !tblKeys.has(k));
const onlyTbl = [...tblKeys].filter((k) => !jsonKeys.has(k));

console.log('Keys in JSON but NOT in tables:');
if (onlyJson.length === 0) console.log('  (none)');
for (const k of onlyJson) console.log('  -', k);

console.log('\nKeys in tables but NOT in JSON:');
if (onlyTbl.length === 0) console.log('  (none)');
for (const k of onlyTbl) console.log('  +', k);

if (AppDataSource && AppDataSource.isInitialized) AppDataSource.destroy();
process.exit(0);
