const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const dictionary = require('./source-language.translations.json');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.source-language');
const extensions = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const sourceDirectories = ['src', 'app', 'components', 'constants', 'contexts', 'hooks', 'lib', 'plugins', 'scripts'];
const excludedDirectories = new Set(['node_modules', '.git', '.source-language', 'dist', 'build', 'coverage']);
const excludedFile = /(?:^|\/)source-language(?:\.[^/]*)?$|\.timestamp-.*\.[cm]?js$/;
const spanish = /[ñáéíóúü¿¡]|\b(?:usuario[s]?|contrase[nñ]a[s]?|fecha[s]?|archivo[s]?|nombre[s]?|apellido[s]?|correo|tel[eé]fono|direcci[oó]n|trabajador(?:es)?|empleado[s]?|cliente[s]?|proyecto[s]?|turno[s]?|equipo[s]?|permiso[s]?|requerid[oa]s?|obligatori[oa]s?|inv[aá]lid[oa]s?|encontrad[oa]s?|disponible[s]?|eliminar|guardar|cancelar|seleccionar|seleccione|debe|deben|puede|pueden|crear|actualizar|consultar|mostrar|cargar|cerrar|abrir|asignar|asignado|asignada|existe|existen|exitosamente|correctamente|pendiente|completado|rechazado|bienvenido|hola|gracias|solo|solamente|desde|hasta|para|pero|tambi[eé]n|ning[uú]n|ninguna|todos|todas)\b/i;

function parse(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n')}`);
  }
  return source;
}

function isProtectedComment(raw) {
  if (/^\/\/\/\s*</.test(raw)) return true;
  if (/@[A-Za-z_][\w-]*/.test(raw)) return true;
  const body = raw.replace(/^\/\*+|^\/\//, '').replace(/\*\/$/, '').trim();
  return /^(?:eslint(?:-[\w-]+)?|global[s]?|exported|prettier(?:-[\w-]+)?|biome-ignore(?:-all|-start|-end)?|deno-lint-ignore(?:-file)?|istanbul\s+ignore|c8\s+ignore|v8\s+ignore|nyc\s+ignore|webpack[\w]*\s*:|[#$]\s*(?:__PURE__|__NO_SIDE_EFFECTS__|sourceMappingURL|sourceURL)|<(?:reference|amd-module|amd-dependency)\b)/.test(body);
}

function analyze(file, text, includeAll = false) {
  const source = parse(file, text);
  const comments = new Map();
  const strings = [];
  const protectedRanges = [];
  function commentRanges(position) {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, position) || []),
      ...(ts.getTrailingCommentRanges(text, position) || []),
    ]) comments.set(range.pos, range);
  }
  function visit(node) {
    commentRanges(node.pos);
    commentRanges(node.end);
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    const fragment = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    const jsx = ts.isJsxText(node);
    if (literal || fragment || jsx || ts.isRegularExpressionLiteral(node)) {
      protectedRanges.push({ start: jsx ? node.pos : node.getStart(source), end: node.end });
    }
    if (literal || fragment || jsx) {
      const value = node.text;
      if (value.trim() && (includeAll || spanish.test(value))) {
        const start = jsx ? node.pos : node.getStart(source);
        const location = source.getLineAndCharacterOfPosition(start);
        const parent = node.parent;
        const technical = !jsx && (
          (parent.name === node && !ts.isJsxAttribute(parent)) ||
          ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) ||
          ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent) ||
          ts.isElementAccessExpression(parent) ||
          ['sí', 'si', 'no'].includes(value.toLowerCase()) ||
          /^(?:https?:|[./\\])|\b(?:SELECT|INSERT INTO|UPDATE|CREATE TABLE|ALTER TABLE|DELETE FROM)\b/i.test(value)
        );
        const kind = jsx ? 'jsx' : ts.isJsxAttribute(parent) ? 'jsxAttribute' : fragment ? 'fragment' : text[start] === '`' ? 'template' : 'string';
        const id = crypto.createHash('sha256').update(`${file}\0${start}\0${value}`).digest('hex').slice(0, 20);
        strings.push({ id, file, line: location.line + 1, start, end: node.end, kind, text: value, technical, suspectedSpanish: spanish.test(value), translation: null });
      }
      return;
    }
    for (const child of node.getChildren(source)) visit(child);
  }
  visit(source);
  commentRanges(0);
  return { strings, comments: [...comments.values()].filter(range => !protectedRanges.some(protectedRange => range.pos < protectedRange.end && range.end > protectedRange.start)).sort((a, b) => a.pos - b.pos).map(range => ({ ...range, preserve: isProtectedComment(text.slice(range.pos, range.end)) })) };
}

function listFiles(projectRoot = root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) walk(full);
      else if (entry.isFile() && extensions.test(entry.name) && !excludedFile.test(entry.name)) files.push(path.relative(projectRoot, full).replaceAll('\\', '/'));
    }
  }
  for (const directory of sourceDirectories) {
    const full = path.join(projectRoot, directory);
    if (fs.existsSync(full) && fs.lstatSync(full).isDirectory() && !fs.lstatSync(full).isSymbolicLink()) walk(full);
  }
  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (entry.isFile() && extensions.test(entry.name) && !excludedFile.test(entry.name)) files.push(entry.name);
  }
  return files.sort();
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function scan(includeAll) {
  const manifest = { version: 1, scope: { directories: sourceDirectories, rootFiles: true, extensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs'] }, files: {}, entries: [], commentCount: 0, protectedCommentCount: 0 };
  for (const file of listFiles()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const result = analyze(file, text, includeAll);
    manifest.files[file] = hash(text);
    manifest.entries.push(...result.strings);
    manifest.commentCount += result.comments.length;
    manifest.protectedCommentCount += result.comments.filter(comment => comment.preserve).length;
  }
  for (const entry of manifest.entries) {
    const key = entry.kind === 'jsx' ? entry.text.replace(/\s+/g, ' ').trim() : entry.text;
    if (!entry.technical && Object.hasOwn(dictionary, key)) entry.translation = dictionary[key];
  }
  fs.mkdirSync(output, { recursive: true });
  const target = path.join(output, 'translations.json');
  if (fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
    const entries = new Map(previous.entries.map(entry => [entry.id, entry]));
    for (const entry of manifest.entries) {
      const old = entries.get(entry.id);
      if (old && old.text === entry.text) {
        if (old.translation != null) entry.translation = old.translation;
        if (old.allowTechnical === true) entry.allowTechnical = true;
      }
    }
    fs.copyFileSync(target, path.join(output, `translations.previous-${Date.now()}.json`));
  }
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${Object.keys(manifest.files).length} files, ${manifest.entries.length} text candidates, ${manifest.commentCount} comments (${manifest.protectedCommentCount} protected).\nCatalog: ${target}`);
  return manifest;
}

function encode(entry, raw) {
  const value = entry.translation;
  const placeholders = value => (value.match(/\{\{[^{}]+\}\}|\{[\w.]+\}|%[sdif]/g) || []).sort();
  if (JSON.stringify(placeholders(entry.text)) !== JSON.stringify(placeholders(value))) {
    throw new Error(`${entry.file}:${entry.line}: placeholders changed`);
  }
  if (entry.kind === 'jsx' || entry.kind === 'jsxAttribute') return `{${JSON.stringify(value)}}`;
  if (entry.kind === 'template' || entry.kind === 'fragment') {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
    if (entry.kind === 'template') return '`' + escaped + '`';
    const left = raw.startsWith('`') ? '`' : '}';
    const right = raw.endsWith('${') ? '${' : '`';
    return left + escaped + right;
  }
  if (raw[0] === '"') return JSON.stringify(value);
  return "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029') + "'";
}

function transform(file, text, entries, removeComments) {
  const analysis = analyze(file, text, true);
  const known = new Map(analysis.strings.map(entry => [entry.id, entry]));
  const edits = [];
  for (const requested of entries) {
    if (requested.translation == null || requested.translation === requested.text) continue;
    if (typeof requested.translation !== 'string' || !requested.translation.trim()) throw new Error(`Invalid translation: ${requested.id}`);
    const actual = known.get(requested.id);
    if (!actual || actual.text !== requested.text) throw new Error(`Stale translation: ${requested.id}; scan again`);
    if (actual.technical && requested.allowTechnical !== true) throw new Error(`${file}:${actual.line}: technical value requires allowTechnical: true`);
    edits.push({ start: actual.start, end: actual.end, replacement: encode({ ...actual, translation: requested.translation }, text.slice(actual.start, actual.end)) });
  }
  if (removeComments) {
    for (const range of analysis.comments) {
      if (range.preserve) continue;
      edits.push({ start: range.pos, end: range.end, replacement: text.slice(range.pos, range.end).replace(/[^\r\n]/g, ' ') });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let previousStart = text.length;
  let result = text;
  for (const edit of edits) {
    if (edit.end > previousStart) throw new Error(`${file}: overlapping edits`);
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    previousStart = edit.start;
  }
  parse(file, result);
  return result;
}

function apply({ write, removeComments, commentsOnly }) {
  const catalog = commentsOnly ? null : JSON.parse(fs.readFileSync(path.join(output, 'translations.json'), 'utf8'));
  const files = listFiles();
  if (catalog && JSON.stringify(Object.keys(catalog.files).sort()) !== JSON.stringify(files)) throw new Error('Source file list changed; scan again');
  const changes = [];
  for (const file of files) {
    const before = fs.readFileSync(path.join(root, file), 'utf8');
    if (catalog && catalog.files[file] !== hash(before)) throw new Error(`${file} changed since scan; scan again`);
    const after = transform(file, before, catalog ? catalog.entries.filter(entry => entry.file === file) : [], removeComments);
    if (before !== after) changes.push({ file, before, after });
  }
  const unresolved = catalog ? catalog.entries.filter(entry => entry.translation == null).length : 0;
  console.log(`${write ? 'Apply' : 'Preview'}: ${changes.length} files would change; ${unresolved} untranslated candidates remain.`);
  if (removeComments) console.log('Tool directives and tagged JSDoc are preserved.');
  for (const change of changes) console.log(change.file);
  if (!write || changes.length === 0) return;
  const backup = path.join(output, 'backups', `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  for (const change of changes) {
    const target = path.join(backup, change.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, change.before);
  }
  for (const change of changes) fs.writeFileSync(path.join(root, change.file), change.after);
  console.log(`Applied. Original files backed up at ${backup}`);
}

function main(args) {
  const [command, ...flags] = args;
  if (!['scan', 'apply', 'comments'].includes(command) || flags.some(flag => !['--all', '--write', '--remove-comments'].includes(flag))) {
    throw new Error('Usage: node scripts/source-language.cjs scan [--all] | apply [--remove-comments] [--write] | comments [--write]');
  }
  if (command === 'scan') return scan(flags.includes('--all'));
  apply({ write: flags.includes('--write'), removeComments: command === 'comments' || flags.includes('--remove-comments'), commentsOnly: command === 'comments' });
}

module.exports = { analyze, transform, listFiles };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
