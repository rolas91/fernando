import { applyLegacyTypeField } from './workers.service';
import type { Worker } from '../../../entities/worker.entity';
import type { WorkerRole } from '../../../entities/worker-role.entity';

function makeRole(name: string, status: 'active' | 'inactive' = 'active'): WorkerRole {
  return { id: `r-${name}`, name, status };
}

function makeWorker(type = ''): Worker {
  return { type } as unknown as Worker;
}

describe('applyLegacyTypeField', () => {
  it('keeps the worker type independent from active role names', () => {
    const worker = makeWorker('Full-Time Employee');
    applyLegacyTypeField(worker, [makeRole('Flagger'), makeRole('Foreman')]);
    expect(worker.type).toBe('Full-Time Employee');
  });

  it('trims whitespace from the existing worker type', () => {
    const worker = makeWorker('  Part-Time Employee  ');
    applyLegacyTypeField(worker, [makeRole('  Flagger  ')]);
    expect(worker.type).toBe('Part-Time Employee');
  });

  it('ignores inactive roles', () => {
    const worker = makeWorker('Temporary / Seasonal');
    applyLegacyTypeField(worker, [
      makeRole('Flagger', 'inactive'),
      makeRole('Foreman'),
    ]);
    expect(worker.type).toBe('Temporary / Seasonal');
  });

  it('ignores roles with empty names', () => {
    const worker = makeWorker('Subcontractor');
    applyLegacyTypeField(worker, [makeRole(''), makeRole('Foreman')]);
    expect(worker.type).toBe('Subcontractor');
  });

  it('leaves type unchanged when no active role is provided', () => {
    const worker = makeWorker('OriginalType');
    applyLegacyTypeField(worker, []);
    expect(worker.type).toBe('OriginalType');
  });

  it('leaves type unchanged when all roles are inactive', () => {
    const worker = makeWorker('OriginalType');
    applyLegacyTypeField(worker, [makeRole('Flagger', 'inactive')]);
    expect(worker.type).toBe('OriginalType');
  });

  it('handles a missing workerRoles argument as an empty list', () => {
    const worker = makeWorker('OriginalType');
    applyLegacyTypeField(worker, undefined as unknown as WorkerRole[]);
    expect(worker.type).toBe('OriginalType');
  });
});
