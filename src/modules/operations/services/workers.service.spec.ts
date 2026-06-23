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
  it('sets type to the first active role name', () => {
    const worker = makeWorker('Foreman');
    applyLegacyTypeField(worker, [makeRole('Flagger'), makeRole('Foreman')]);
    expect(worker.type).toBe('Flagger');
  });

  it('trims whitespace from the role name', () => {
    const worker = makeWorker('');
    applyLegacyTypeField(worker, [makeRole('  Flagger  ')]);
    expect(worker.type).toBe('Flagger');
  });

  it('skips inactive roles', () => {
    const worker = makeWorker('OldType');
    applyLegacyTypeField(worker, [
      makeRole('Flagger', 'inactive'),
      makeRole('Foreman'),
    ]);
    expect(worker.type).toBe('Foreman');
  });

  it('skips roles with empty names', () => {
    const worker = makeWorker('OldType');
    applyLegacyTypeField(worker, [makeRole(''), makeRole('Foreman')]);
    expect(worker.type).toBe('Foreman');
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
