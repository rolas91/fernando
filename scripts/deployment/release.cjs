const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function validateRelease(value, repository = 'rolas91/fernando') {
  if (value?.schema !== 1 || value.repository !== repository || !/^[a-f0-9]{40}$/.test(value.commit) ||
      !/^[1-9][0-9]*$/.test(value.runId) || !/^[1-9][0-9]*$/.test(value.attempt)) throw Error('Invalid release identity');
  for (const role of ['api', 'web']) {
    const escaped = repository.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`^ghcr\\.io/${escaped}-${role}@sha256:[a-f0-9]{64}$`).test(value[role])) throw Error('Invalid immutable image: ' + role);
  }
  return value;
}
function validateRun(run, repository) {
  if (run.status !== 'completed' || run.conclusion !== 'success' || !['push', 'workflow_dispatch'].includes(run.event) ||
      run.head_branch !== 'master' || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.path !== '.github/workflows/ci-deploy.yml') throw Error('Only successful master releases from this repository can be promoted');
  return run;
}
function validateReceipt(receipt, run, repository) {
  const release = validateRelease(receipt.release, repository);
  if (receipt.environment !== 'dev' || receipt.healthy !== true || release.commit !== run.head_sha ||
      release.runId !== String(run.id) || release.attempt !== String(run.run_attempt)) throw Error('Dev receipt does not match this run');
  return release;
}
function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${bin} failed: ${result.stderr || result.stdout || result.status}`);
  return result.stdout;
}
function output(values) {
  for (const [key, value] of Object.entries(values)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
function api(route) { return JSON.parse(command('gh', ['api', route])); }

function create(env) {
  const release = validateRelease({ schema: 1, repository: env.GITHUB_REPOSITORY, commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, api: env.API_IMAGE, web: env.WEB_IMAGE }, env.GITHUB_REPOSITORY);
  write('release.json', release);
}
function loadValidated(env) {
  if (env.GITHUB_REF !== 'refs/heads/master' || env.VALIDATED_IN_DEV !== 'true' || !/^[1-9][0-9]*$/.test(env.RELEASE_RUN || '')) throw Error('Select master and confirm the dev validation');
  const repository = env.GITHUB_REPOSITORY;
  const run = validateRun(api(`repos/${repository}/actions/runs/${env.RELEASE_RUN}`), repository);
  const artifacts = api(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`).artifacts;
  const name = `dev-validated-${run.run_attempt}`;
  const matches = artifacts.filter(a => a.name === name && !a.expired);
  if (matches.length !== 1) throw Error('This release has no unexpired successful dev receipt');
  const dir = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'validated-release-'));
  command('gh', ['run', 'download', String(run.id), '--repo', repository, '--name', name, '--dir', dir]);
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'dev-validated.json'), 'utf8'));
  const release = validateReceipt(receipt, run, repository);
  write('release.json', release);
  output({ api: release.api, web: release.web, release: `${release.runId}-${release.attempt}`, commit: release.commit });
}
function deploy(env) {
  if (env.GITHUB_REF !== 'refs/heads/master' || !['dev', 'production'].includes(env.DEPLOY_ENVIRONMENT)) throw Error('Deployment must run from master');
  const release = validateRelease(JSON.parse(fs.readFileSync('release.json', 'utf8')), env.GITHUB_REPOSITORY);
  const host = env.DEPLOY_HOST, user = env.DEPLOY_USER, port = env.DEPLOY_PORT || '22';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(host || '') || !/^[a-z_][a-z0-9_-]*$/.test(user || '') || !/^\d{1,5}$/.test(port) || Number(port) > 65535 || Number(port) < 1) throw Error('Invalid SSH destination');
  if (!env.DEPLOY_SSH_KEY?.trim() || !env.DEPLOY_KNOWN_HOSTS?.trim()) throw Error('Configure environment SSH credentials');
  const dir = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'deploy-ssh-'));
  const key = path.join(dir, 'key'), hosts = path.join(dir, 'known_hosts');
  const health = env.DEPLOY_ENVIRONMENT === 'dev' ? 'https://dev.drworkops.com/api-healthz' : 'https://drworkops.com/api-healthz';
  try {
    fs.writeFileSync(key, env.DEPLOY_SSH_KEY.trim() + '\n', { mode: 0o600 });
    fs.writeFileSync(hosts, env.DEPLOY_KNOWN_HOSTS.trim() + '\n', { mode: 0o600 });
    const script = fs.readFileSync(path.join(__dirname, '../../backend/deploy/deploy-release.sh'), 'utf8').replaceAll('\r\n', '\n');
    const args = ['-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${hosts}`, '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-p', port, `${user}@${host}`,
      `bash -s -- ${env.DEPLOY_ENVIRONMENT} ${release.api} ${release.web} ${release.runId}-${release.attempt} ${health}`];
    const result = spawnSync('ssh', args, { input: script, stdio: ['pipe', 'inherit', 'inherit'], timeout: 18 * 60 * 1000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error('Deployment failed; inspect the rollback result above');
    write(env.DEPLOY_ENVIRONMENT === 'dev' ? 'dev-validated.json' : 'production-deployed.json', { environment: env.DEPLOY_ENVIRONMENT, healthy: true, release, deployedAt: new Date().toISOString(), deploymentRun: env.GITHUB_RUN_ID });
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${env.DEPLOY_ENVIRONMENT}: healthy\nRelease: ${release.runId}-${release.attempt}\n\nCommit: ${release.commit}\n\nAPI: ${release.api}\n\nWeb: ${release.web}\n`);
  } finally {
    for (const file of [key, hosts]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}
if (require.main === module) {
  try {
    const action = { create, load: loadValidated, deploy }[process.argv[2]];
    if (!action) throw Error('Expected create, load or deploy');
    action(process.env);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateRelease, validateRun, validateReceipt, create, loadValidated, deploy };
