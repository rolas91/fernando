const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, transform, listFiles } = require('./source-language.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('removes comments while preserving URLs, regexes, template expressions and newlines', () => {
  const source = '// start\nconst url = "https://example.com/*path*/";\nconst re = /https?:\\/\\//;\nconst value = `Hola ${1 /* inner */ + 2} mundo`; // end\nconst n = 1/* between */+2;\n/* multiline\ncomment */\n';
  const result = transform('src/test.ts', source, [], true);
  assert.equal(analyze('src/test.ts', result, true).comments.length, 0);
  assert.ok(result.includes('"https://example.com/*path*/"'));
  assert.ok(result.includes('/https?:\\/\\//'));
  assert.ok(result.includes('`Hola ${1'));
  assert.equal(result.split('\n').length, source.split('\n').length);
});

test('does not interpret comment markers inside multiline templates as comments', () => {
  const source = 'const text = `first\n// literal\n/* literal */`;\n';
  assert.equal(transform('src/test.ts', source, [], true), source);
});

test('translates literals and template fragments without changing interpolated code', () => {
  const source = "const a = 'Usuario inválido'; const b = `Hola ${user.name}!`;";
  const entries = analyze('src/test.ts', source).strings;
  for (const entry of entries) entry.translation = entry.text === 'Hola ' ? 'Hello ' : "User isn't valid";
  const result = transform('src/test.ts', source, entries, false);
  assert.ok(result.includes("'User isn\\'t valid'"));
  assert.ok(result.includes('`Hello ${user.name}!`'));
});

test('blocks technical keys and SQL until explicitly reviewed', () => {
  const source = "const obj = { 'usuario': 'Hola' }; const sql = 'SELECT usuario FROM users';";
  const entries = analyze('src/test.ts', source).strings;
  const technical = entries.find(entry => entry.text === 'usuario');
  technical.translation = 'user';
  assert.throws(() => transform('src/test.ts', source, [technical], false), /technical value/);
  assert.ok(entries.find(entry => entry.text.startsWith('SELECT')).technical);
});

test('rejects changed placeholders and stale entries', () => {
  const source = "const text = 'Hola {name}';";
  const [entry] = analyze('src/test.ts', source).strings;
  assert.throws(() => transform('src/test.ts', source, [{ ...entry, translation: 'Hello' }], false), /placeholders/);
  assert.throws(() => transform('src/test.ts', source + ' ', [{ ...entry, id: 'stale', translation: 'Hello {name}' }], false), /Stale/);
});

test('handles JSX comments and text without emitting invalid JSX', () => {
  const source = 'const el = <div>{/* comment */}Hola</div>;';
  const entries = analyze('src/test.tsx', source).strings;
  entries[0].translation = 'Hello <friend>';
  const result = transform('src/test.tsx', source, entries, true);
  assert.ok(result.includes('{"Hello <friend>"}'));
  assert.equal(analyze('src/test.tsx', result, true).comments.length, 0);
});

test('escapes translated JSX attributes and preserves JSX text whitespace', () => {
  const source = 'const el = <Text title="Hola"> Hola </Text>;';
  const entries = analyze('app/test.tsx', source).strings;
  entries.find(entry => entry.kind === 'jsxAttribute').translation = 'Hello "friend" & team';
  entries.find(entry => entry.kind === 'jsx').translation = ' Hello ';
  const result = transform('app/test.tsx', source, entries, false);
  assert.equal(result, 'const el = <Text title={"Hello \\"friend\\" & team"}>{" Hello "}</Text>;');
});

test('discovers web and mobile source while excluding generated files and utility', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-language-test-'));
  const included = ['src/main.ts', 'app/(tabs)/index.tsx', 'components/button.tsx', 'contexts/auth.tsx', 'constants/theme.ts', 'hooks/useTheme.ts', 'lib/client.ts', 'plugins/custom.js', 'scripts/build.cjs', 'app.config.js'];
  const excluded = ['node_modules/library/index.js', 'android/generated.js', '.source-language/backups/src/main.ts', 'dist/bundle.js', 'src/node_modules/dependency.js', 'scripts/source-language.cjs', 'scripts/source-language.test.cjs', 'vite.config.ts.timestamp-123.mjs'];
  try {
    for (const file of [...included, ...excluded]) {
      const target = path.join(directory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '');
    }
    assert.deepEqual(listFiles(directory), included.sort());
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test('preserves visible JSX text that looks like a comment', () => {
  const source = 'const el = <div>/* visible text */ // visible too</div>; // actual comment\n';
  const result = transform('app/test.tsx', source, [], true);
  assert.ok(result.includes('<div>/* visible text */ // visible too</div>'));
  assert.ok(!result.includes('actual comment'));
});

test('preserves functional directives byte-for-byte and removes ordinary explanations', () => {
  const directives = [
    '/// <reference types="vite/client" />',
    '// @ts-check',
    '// @ts-nocheck',
    '// @ts-ignore',
    '// @ts-expect-error: external API mismatch',
    '// eslint-disable-next-line no-console',
    '/* eslint-disable no-console */',
    '/* global window */',
    '// prettier-ignore',
    '/* istanbul ignore next */',
    '/* c8 ignore next */',
    '/* #__PURE__ */',
    '/* @__PURE__ */',
    '/* webpackChunkName: "chunk" */',
    '// @vite-ignore',
    '/** @type {number} */',
    '/**\n * @param {string} name\n * @returns {string}\n */',
    '//# sourceMappingURL=index.js.map',
  ];
  for (const directive of directives) {
    const source = `${directive}\nconst x = 1; // ordinary explanation\n/** explanatory documentation */\n`;
    const result = transform('src/test.ts', source, [], true);
    assert.ok(result.startsWith(directive), directive);
    assert.ok(!result.includes('ordinary explanation'));
    assert.ok(!result.includes('explanatory documentation'));
    assert.equal(result.split('\n').length, source.split('\n').length);
  }
});

test('preserves JavaScript type checking supplied by JSDoc', () => {
  const ts = require('typescript');
  const source = '/** @type {number} */\nconst value = "wrong type"; // ordinary explanation\n';
  const after = transform('fixture.js', source, [], true);
  const diagnostics = text => {
    const options = { allowJs: true, checkJs: true, noEmit: true, noLib: true, types: [] };
    const host = ts.createCompilerHost(options);
    host.getSourceFile = file => file === 'fixture.js' ? ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) : undefined;
    const program = ts.createProgram(['fixture.js'], options, host);
    return program.getSemanticDiagnostics().map(diagnostic => diagnostic.code);
  };
  assert.ok(diagnostics(source).includes(2322));
  assert.deepEqual(diagnostics(after), diagnostics(source));
});

test('CLI previews without writing, rejects stale sources and backs up before applying', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-language-cli-'));
  try {
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.mkdirSync(path.join(directory, 'src'));
    for (const file of ['source-language.cjs', 'source-language.translations.json']) {
      fs.copyFileSync(path.join(__dirname, file), path.join(directory, 'scripts', file));
    }
    const original = '// comment\nconst message = "Usuario no encontrado";\n';
    const target = path.join(directory, 'src', 'example.ts');
    fs.writeFileSync(target, original);
    const invoke = (...args) => spawnSync(process.execPath, [path.join(directory, 'scripts', 'source-language.cjs'), ...args], {
      env: { ...process.env, NODE_PATH: path.resolve(__dirname, '..', 'node_modules') }, encoding: 'utf8',
    });
    assert.equal(invoke('scan').status, 0);
    const preview = invoke('apply', '--remove-comments');
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    fs.appendFileSync(target, '\n');
    const stale = invoke('apply', '--remove-comments', '--write');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /changed since scan/);
    assert.equal(fs.existsSync(path.join(directory, '.source-language', 'backups')), false);
    fs.writeFileSync(target, original);
    const applied = invoke('apply', '--remove-comments', '--write');
    assert.equal(applied.status, 0, applied.stderr);
    const result = fs.readFileSync(target, 'utf8');
    assert.ok(result.includes('User not found'));
    assert.ok(!result.includes('// comment'));
    const backupDirectory = path.join(directory, '.source-language', 'backups');
    const [backup] = fs.readdirSync(backupDirectory);
    assert.equal(fs.readFileSync(path.join(backupDirectory, backup, 'src', 'example.ts'), 'utf8'), original);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
