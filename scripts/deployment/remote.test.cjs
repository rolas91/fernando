const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bash = process.env.BASH_PATH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const python = process.env.DEPLOY_TEST_PYTHON || 'python3';
const available = spawnSync(bash, ['--version']).status === 0 && spawnSync(python, ['--version']).status === 0;
const base = path.resolve(__dirname, '../../.cache/release-tests');
const image = role => `ghcr.io/rolas91/fernando-${role}@sha256:${(role === 'api' ? 'a' : 'b').repeat(64)}`;
const previous = { services: { api: { image: image('api').replace(/a{64}$/, 'c'.repeat(64)) }, web: { image: image('web').replace(/b{64}$/, 'd'.repeat(64)) } } };
function scenario(name, environment, mode, verify) {
  test(name, { skip: available ? false : 'Bash and Python 3 are required for isolated deployment simulations' }, () => {
    fs.mkdirSync(base, { recursive: true });
    const dir = fs.mkdtempSync(path.join(base, 'fixture-'));
    const unix = value => process.platform === 'win32' ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : value;
    try {
      const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
      const source = fs.readFileSync(path.join(__dirname, '../../backend/deploy/deploy-release.sh'), 'utf8')
        .replaceAll('/opt/dr-workops-test', unix(dir)).replaceAll('/opt/dr-workops', unix(dir));
      fs.writeFileSync(path.join(dir, 'deploy.sh'), source.replaceAll('\r\n', '\n'));
      fs.writeFileSync(path.join(dir, '.env.dev'), 'DB_PASSWORD=private-test-only\n');
      fs.writeFileSync(path.join(dir, '.env.production'), 'DB_PASSWORD=private-test-only\n');
      const before = `API_IMAGE=${previous.services.api.image}\nWEB_IMAGE=${previous.services.web.image}\n`;
      fs.writeFileSync(path.join(dir, '.env.images'), before);
      fs.writeFileSync(path.join(dir, 'previous.json'), JSON.stringify(previous));
      fs.writeFileSync(path.join(bin, 'docker'), `#!/usr/bin/env bash\nset -eu\nprintf '%s\\n' "$*" >> commands.log\nif [[ "$*" == *'config --format json'* ]]; then cat previous.json; fi\nif [[ "${mode}" == fail-up && "$*" == *'up -d'* && ! -f failed-once ]]; then touch failed-once; exit 9; fi\nif [[ "${mode}" == fail-pull && "$1" == pull ]]; then exit 9; fi\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> health.log\n${mode === 'fail-public' ? 'exit 22' : 'exit 0'}\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      if (process.platform === 'win32') {
        fs.writeFileSync(path.join(bin, 'flock'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
        fs.writeFileSync(path.join(bin, 'python3'), `#!/usr/bin/env bash\nexec "${python.replaceAll('\\', '/')}" "$@"\n`, { mode: 0o755 });
      }
      const health = environment === 'dev' ? 'https://dev.drworkops.com/api-healthz' : 'https://drworkops.com/api-healthz';
      const result = spawnSync(bash, ['-c', 'export PATH="$1:$PATH"; exec bash ./deploy.sh "$2" "$3" "$4" 123-1 "$5"', 'fixture', unix(bin), environment, image('api'), image('web'), health], { cwd: dir, encoding: 'utf8', timeout: 30000 });
      assert(!(result.stdout + result.stderr).includes('private-test-only'));
      verify({ result, dir, before, commands: fs.existsSync(path.join(dir, 'commands.log')) ? fs.readFileSync(path.join(dir, 'commands.log'), 'utf8') : '' });
    } finally {
      if (path.dirname(fs.realpathSync(dir)) !== fs.realpathSync(base)) throw Error('Unsafe fixture cleanup path');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
scenario('dev updates exact digests without changing runtime secrets or production config', 'dev', '', ({ result, dir, before, commands }) => {
  assert.equal(result.status, 0, result.stderr); assert.equal(fs.readFileSync(path.join(dir, '.env.images'), 'utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.release-images.json'))).services.web.image, image('web'));
  assert(commands.includes('up -d --wait')); assert(!commands.includes('migrate')); assert(fs.existsSync(path.join(dir, '.release-current.json')));
});
scenario('production records the same pair in its image configuration', 'production', '', ({ result, dir }) => {
  assert.equal(result.status, 0, result.stderr);
  assert(fs.readFileSync(path.join(dir, '.env.images'), 'utf8').includes(`WEB_IMAGE=${image('web')}`));
});
for (const mode of ['fail-up', 'fail-public']) scenario(`${mode} restores the complete previous production pair`, 'production', mode, ({ result, dir, before, commands }) => {
  assert.notEqual(result.status, 0); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.release-images.json'))), previous);
  assert.equal(fs.readFileSync(path.join(dir, '.env.images'), 'utf8'), before);
  assert.equal(commands.split('up -d').length - 1, 2); assert(!fs.existsSync(path.join(dir, '.release-current.json')));
});
scenario('failed download leaves the active configuration untouched', 'dev', 'fail-pull', ({ result, dir, commands }) => {
  assert.notEqual(result.status, 0); assert(!fs.existsSync(path.join(dir, '.release-images.json'))); assert(!commands.includes('up -d'));
});
