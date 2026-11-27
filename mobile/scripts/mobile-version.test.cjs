const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/mobile-version.ts'), 'utf8');
const context = vm.createContext({ exports: {}, URL });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { isOlderVersion, parseVersionPolicy } = context.exports;

test('compares numeric versions, including equal and ahead-of-policy builds', () => {
  assert.equal(isOlderVersion('1.0.4', '1.0.5'), true);
  assert.equal(isOlderVersion('1.0.5', '1.0.5'), false);
  assert.equal(isOlderVersion('1.10.0', '1.9.0'), false);
  assert.equal(isOlderVersion('1.9.9', '2.0.0'), true);
  assert.throws(() => isOlderVersion('bad', '1.0.0'));
});
test('accepts disabled and platform-specific valid policies', () => {
  assert.equal(parseVersionPolicy({ minimumVersion: null, storeUrl: null }, 'ios').minimumVersion, null);
  for (const [platform, storeUrl] of [['ios', 'https://apps.apple.com/app/id123456'], ['android', 'https://play.google.com/store/apps/details?id=com.drtrafficcontrol.mobile']]) {
    assert.equal(parseVersionPolicy({ minimumVersion: '1.0.5', storeUrl }, platform).storeUrl, storeUrl);
  }
});
test('rejects malformed policy and untrusted or wrong-platform store links', () => {
  for (const value of [null, {}, { minimumVersion: 'broken', storeUrl: '' }, { minimumVersion: '1.0.5', storeUrl: 'https://evil.example/app' }, { minimumVersion: '1.0.5', storeUrl: 'https://apps.apple.com/app/id123' }]) {
    assert.throws(() => parseVersionPolicy(value, 'android'));
  }
});
