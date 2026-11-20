const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./pagination-harness.cjs');

const { getShiftWorkerIdsToNotifyOfRemoval } = load(
  'components/scheduler/shiftConfirmation.ts',
  {
    '@/lib/types': {},
    '@/lib/shiftDate': { isFutureShiftDate: () => true },
  },
);

const role = (assignedWorkers, workerConfirmations = []) => ({
  id: 'role-1',
  roleName: 'Flagger',
  requiredCount: assignedWorkers.length,
  assignedWorkers,
  workerConfirmations,
});
const notified = (workerId, extra = {}) => ({
  workerId,
  status: 'pending',
  requestedAt: '2026-11-01T12:00:00.000Z',
  ...extra,
});

// A worker removed before any notification was sent must stay silent. This is
// the reschedule case: workers are staffed on a shift that was never sent to
// them and then moved to another shift.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval({ roles: [role(['w1', 'w2'])] }, ['w1']),
  [],
  'never-notified workers must not receive a removal message',
);

// A request that is still unanswered is enough: confirmation is not required.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    { roles: [role(['w1'], [notified('w1')])] },
    [],
  ),
  ['w1'],
  'an unconfirmed but notified worker must be told about the removal',
);

// A recorded channel without requestedAt also proves the notification was sent.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    {
      roles: [
        role(
          ['w1'],
          [{ workerId: 'w1', status: 'pending', notificationChannel: 'sms' }],
        ),
      ],
    },
    [],
  ),
  ['w1'],
  'a recorded notification channel must count as notified',
);

// Confirmed workers were notified too.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    {
      roles: [
        role(
          ['w1'],
          [
            notified('w1', {
              status: 'confirmed',
              respondedAt: '2026-11-01T13:00:00.000Z',
            }),
          ],
        ),
      ],
    },
    [],
  ),
  ['w1'],
);

// Only the removed workers with a sent notification are included.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    {
      roles: [role(['w1', 'w2', 'w3'], [notified('w1'), notified('w3')])],
    },
    ['w1'],
  ),
  ['w3'],
  'a stale pending request without a send must not trigger a message',
);

// Workers that still hold a slot in the shift are not "removed".
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    { roles: [role(['w1'], [notified('w1')])] },
    ['w1'],
  ),
  [],
);

// A pending confirmation entry created without a send is not evidence.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    {
      roles: [role(['w1'], [{ workerId: 'w1', status: 'pending' }])],
    },
    [],
  ),
  [],
  'a pending record without requestedAt/notificationChannel is not a send',
);

// Moving a worker between roles of the same shift is not a removal.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    { roles: [role(['w1'], [notified('w1')])] },
    ['w1'],
  ),
  [],
);

// The same worker listed twice is reported once.
assert.deepEqual(
  getShiftWorkerIdsToNotifyOfRemoval(
    {
      roles: [
        role(['w1'], [notified('w1')]),
        { ...role(['w1'], [notified('w1')]), id: 'role-2' },
      ],
    },
    [],
  ),
  ['w1'],
);

// Missing shift data (for example a brand new shift) never sends anything.
assert.deepEqual(getShiftWorkerIdsToNotifyOfRemoval(undefined, ['w1']), []);
assert.deepEqual(getShiftWorkerIdsToNotifyOfRemoval({ roles: [] }, []), []);

// Both shift editors must use the shared gate instead of notifying every
// removed worker.
for (const file of ['SchedulerView.tsx', 'SchedulerCalendarView.tsx']) {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/components/scheduler', file),
    'utf8',
  );
  assert.ok(
    source.includes('getShiftWorkerIdsToNotifyOfRemoval('),
    `${file} must gate removal notifications on a previous send`,
  );
  assert.ok(
    !source.includes('...originalWorkerIds]'),
    `${file} must not notify every worker removed from the shift`,
  );
}

console.log(
  'Shift removal notifications: only previously notified workers are told about a removal.',
);
