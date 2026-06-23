import { AppDataSource } from '../data-source';

function pickKeysDeep(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const childKeys = value.flatMap((v) => pickKeysDeep(v, prefix));
    return Array.from(new Set(childKeys));
  }
  if (typeof value === 'object') {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      keys.push(path);
      keys.push(...pickKeysDeep(v, path));
    }
    return keys;
  }
  return [prefix];
}

function flat(obj: unknown, prefix = ''): Record<string, unknown> {
  if (obj === null || obj === undefined) return {};
  if (Array.isArray(obj)) {
    return obj.reduce<Record<string, unknown>>((acc, v, i) => {
      Object.assign(acc, flat(v, `${prefix}[${i}]`));
      return acc;
    }, {});
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') Object.assign(out, flat(v, path));
      else out[path] = v;
    }
    return out;
  }
  return { [prefix]: obj };
}

function getType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  return typeof v;
}

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  const ds = AppDataSource;

  const jsonRows = await ds.query(
    "SELECT shifts FROM work_orders WHERE id = 'wo_demo_asn_2026_856'",
  );
  const json = jsonRows[0].shifts;

  const tblRows = await ds.query(`
    WITH role_data AS (
      SELECT
        r.id, r.shift_id, r.role_name, r.required_count, r.start_time,
        r.required_certification_ids, r.required_skill_ids,
        COALESCE(
          (SELECT jsonb_agg(worker_id ORDER BY worker_id)
           FROM work_order_shift_role_workers WHERE role_id = r.id),
          '[]'::jsonb
        ) AS assigned_workers,
        COALESCE(
          (SELECT jsonb_agg(equipment_id ORDER BY equipment_id)
           FROM work_order_shift_role_equipment WHERE role_id = r.id),
          '[]'::jsonb
        ) AS assigned_equipment,
        COALESCE(
          (SELECT jsonb_agg(material_id ORDER BY material_id)
           FROM work_order_shift_role_materials WHERE role_id = r.id),
          '[]'::jsonb
        ) AS assigned_materials,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object(
            'workerId', worker_id, 'status', confirmation_status,
            'respondedAt', to_char(responded_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'requestedAt', to_char(requested_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'notificationChannel', notification_channel
          ) ORDER BY worker_id)
           FROM work_order_shift_role_workers WHERE role_id = r.id),
          '[]'::jsonb
        ) AS worker_confirmations
      FROM work_order_shift_roles r
    ),
    shift_data AS (
      SELECT
        ws.id, ws.work_order_id, ws.date, ws.start_time, ws.end_time,
        ws.default_role_start_time, ws.shift_template_id,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object(
            'id', rd.id, 'roleName', rd.role_name, 'requiredCount', rd.required_count,
            'startTime', rd.start_time,
            'requiredCertificationIds', rd.required_certification_ids,
            'requiredSkillIds', rd.required_skill_ids,
            'assignedWorkers', rd.assigned_workers,
            'assignedEquipment', rd.assigned_equipment,
            'assignedMaterials', rd.assigned_materials,
            'workerConfirmations', rd.worker_confirmations
          ) ORDER BY rd.id)
           FROM role_data rd WHERE rd.shift_id = ws.id),
          '[]'::jsonb
        ) AS roles
      FROM work_order_shifts ws
      WHERE ws.work_order_id = 'wo_demo_asn_2026_856'
    )
    SELECT jsonb_agg(jsonb_build_object(
      'id', sd.id, 'workOrderId', sd.work_order_id, 'date', sd.date,
      'startTime', sd.start_time, 'endTime', sd.end_time,
      'defaultRoleStartTime', sd.default_role_start_time,
      'shiftTemplateId', sd.shift_template_id,
      'roles', sd.roles
    ) ORDER BY sd.date) AS shifts
    FROM shift_data sd
  `);
  const tbl = tblRows[0].shifts;

  console.log('=== KEYS COMPARISON ===');
  const jsonKeys = new Set(pickKeysDeep(json));
  const tblKeys = new Set(pickKeysDeep(tbl));
  const onlyJson = [...jsonKeys].filter((k) => !tblKeys.has(k));
  const onlyTbl = [...tblKeys].filter((k) => !jsonKeys.has(k));
  console.log('Keys in JSON but not in TABLES:', onlyJson.length ? onlyJson : '  (none)');
  for (const k of onlyJson) console.log('  -', k);
  console.log('Keys in TABLES but not in JSON:', onlyTbl.length ? onlyTbl : '  (none)');
  for (const k of onlyTbl) console.log('  +', k);

  console.log('\n=== TYPE COMPARISON (top-level) ===');
  const jsonFlat = flat(json);
  const tblFlat = flat(tbl);
  const allPaths = new Set([...Object.keys(jsonFlat), ...Object.keys(tblFlat)]);
  for (const path of [...allPaths].sort()) {
    const j = jsonFlat[path];
    const t = tblFlat[path];
    const jt = j === undefined ? '∅' : getType(j);
    const tt = t === undefined ? '∅' : getType(t);
    const match = jt === tt ? '✓' : '✗';
    console.log(`  ${match} ${path}: json=${jt} | tbl=${tt}${j !== t && j !== undefined && t !== undefined ? ` | ${JSON.stringify(j)} vs ${JSON.stringify(t)}` : ''}`);
  }

  console.log('\n=== VALUE COMPARISON (where types match) ===');
  let diffs = 0;
  for (const path of [...allPaths].sort()) {
    const j = jsonFlat[path];
    const t = tblFlat[path];
    if (j === undefined || t === undefined) continue;
    if (getType(j) !== getType(t)) continue;
    const eq = JSON.stringify(j) === JSON.stringify(t);
    if (!eq) {
      diffs++;
      console.log(`  ✗ ${path}: ${JSON.stringify(j)} ≠ ${JSON.stringify(t)}`);
    }
  }
  if (diffs === 0) console.log('  (no value differences)');

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
