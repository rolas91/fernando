const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateRelease, validateRun, validateReceipt } = require('./release.cjs');
const release = () => ({ schema: 1, repository: 'rolas91/fernando', commit: 'a'.repeat(40), runId: '123', attempt: '1',
  api: 'ghcr.io/rolas91/fernando-api@sha256:' + 'b'.repeat(64), web: 'ghcr.io/rolas91/fernando-web@sha256:' + 'c'.repeat(64) });
const run = () => ({ status: 'completed', conclusion: 'success', event: 'push', head_branch: 'master', repository: { full_name: 'rolas91/fernando' }, head_repository: { full_name: 'rolas91/fernando' }, path: '.github/workflows/ci-deploy.yml' });
test('release selection preserves both exact image digests', () => {
  const value = release(); assert.deepEqual(validateRelease(value), value); assert.equal(validateRun(run(), value.repository).head_branch, 'master');
});
test('mutable, foreign, swapped and injected images cannot reach SSH', () => {
  for (const image of ['ghcr.io/rolas91/fernando-web:latest', release().api, release().web + '; touch /tmp/unsafe', release().web.replace('rolas91', 'other')]) {
    assert.throws(() => validateRelease({ ...release(), web: image }));
  }
  for (const change of [{ runId: '../123' }, { attempt: '0' }, { commit: 'master' }, { schema: 2 }, { repository: 'other/repo' }]) assert.throws(() => validateRelease({ ...release(), ...change }));
});
test('failed builds, forks, PRs and unrelated workflows cannot be promoted', () => {
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' }, { head_branch: 'feature' },
    { head_repository: { full_name: 'fork/fernando' } }, { path: '.github/workflows/another.yml' }]) assert.throws(() => validateRun({ ...run(), ...change }, 'rolas91/fernando'));
});
test('a healthy dev receipt is bound to the same commit, run and attempt', () => {
  const build = { ...run(), id: 123, run_attempt: 1, head_sha: release().commit };
  const receipt = { environment: 'dev', healthy: true, release: release() };
  assert.deepEqual(validateReceipt(receipt, build, 'rolas91/fernando'), release());
  for (const change of [{ environment: 'production' }, { healthy: false }, { release: { ...release(), commit: 'd'.repeat(40) } },
    { release: { ...release(), attempt: '2' } }, { release: { ...release(), runId: '456' } }]) assert.throws(() => validateReceipt({ ...receipt, ...change }, build, 'rolas91/fernando'));
});
test('master protection requires PR and successful up-to-date CI, including administrators', () => {
  const policy = require('../../.github/master-protection.json');
  assert.equal(policy.enforce_admins, true);
  assert(policy.required_pull_request_reviews);
  assert.equal(policy.required_status_checks.strict, true);
  assert.deepEqual(policy.required_status_checks.checks, ['ci', 'api', 'web'].map(context => ({ context, app_id: 15368 })));
  assert.equal(policy.allow_force_pushes, false); assert.equal(policy.allow_deletions, false);
});
test('release helper does not contain automatic database migrations or runtime secret replacement', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../backend/deploy/deploy-release.sh'), 'utf8');
  assert(!source.includes('run-migrations')); assert(!source.includes('migration:'));
  assert(source.includes('flock -w 600')); assert(source.includes('trap rollback ERR INT TERM HUP'));
  assert(source.includes('previous-images.json')); assert(source.includes('curl --fail'));
});
