const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const policySource = fs.readFileSync(path.join(root, 'lib/appDataPages.ts'), 'utf8');
const policyModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(policyModule, policyModule.exports);
const { PAGE_RESOURCES, SHELL_RESOURCES, SHELL_OPTIONAL_RESOURCES, PAGED_PAGE_RESOURCES, ON_DEMAND_PAGE_RESOURCES } = policyModule.exports;
const context = fs.readFileSync(path.join(root, 'contexts/AppContext.tsx'), 'utf8');
const resourceNames = new Set([...Object.values(PAGE_RESOURCES).flat(), ...SHELL_RESOURCES]);
const lookups = { pendingTimesheetsCount: 'timesheetSummary', getWorkerById: 'workers', getProjectById: 'projects', getClientById: 'clients' };
for (const match of context.matchAll(/(\w+): '(\w+)'/g)) if (resourceNames.has(match[2])) lookups[match[1]] = match[2];

function resolveImport(file, target) {
  if (!target.startsWith('.') && !target.startsWith('@/')) return null;
  const base = target.startsWith('@/') ? path.join(root, target.slice(2)) : path.resolve(path.dirname(file), target);
  if (base.includes(path.sep + 'contexts' + path.sep) || base.includes(path.sep + 'lib' + path.sep)) return null;
  return ['.tsx', '.ts', '/index.tsx'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate));
}
function dependencies(entry) {
  const visited = new Set(), found = new Set();
  function read(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function add(name) { if (resourceNames.has(name)) found.add(name); if (lookups[name]) found.add(lookups[name]); }
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useAppContext') {
        if (ts.isObjectBindingPattern(node.name)) for (const binding of node.name.elements) add((binding.propertyName || binding.name).getText(ast));
        else if (ts.isIdentifier(node.name)) {
          const pattern = new RegExp('\b' + node.name.text + '\.(\w+)', 'g');
          for (const match of text.matchAll(pattern)) add(match[1]);
        }
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveImport(file, node.moduleSpecifier.text);
        if (target) read(target);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  read(entry);
  return found;
}

// Resolve page components from the actual application switch, rather than
// duplicating a list of routes or silently missing a nested form's dependency.
const layoutFile = path.join(root, 'components/AppLayout.tsx');
const layout = ts.createSourceFile(layoutFile, fs.readFileSync(layoutFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = new Map();
for (const statement of layout.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.name && ts.isStringLiteral(statement.moduleSpecifier)) imports.set(statement.importClause.name.text, resolveImport(layoutFile, statement.moduleSpecifier.text));
let pages = 0;
function visitCases(node) {
  if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && node.expression.text in PAGE_RESOURCES) {
    const page = node.expression.text;
    const allowed = new Set([...SHELL_RESOURCES, ...PAGE_RESOURCES[page], ...(PAGED_PAGE_RESOURCES[page] || []), ...(ON_DEMAND_PAGE_RESOURCES[page] || [])]);
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const target = imports.get(node.tagName.getText(layout));
        if (target) for (const dependency of dependencies(target)) assert(allowed.has(dependency), page + ' is missing ' + dependency + ' (including nested dialogs and mutation prerequisites)');
      }
      ts.forEachChild(node, visit);
    }
    node.statements.forEach(visit);
    pages++;
  }
  ts.forEachChild(node, visitCases);
}
visitCases(layout);
assert.equal(pages, Object.keys(PAGE_RESOURCES).length, 'Every application page must have an explicit dependency policy');
for (const shell of ['Header.tsx', 'Sidebar.tsx']) for (const dependency of dependencies(path.join(root, 'components', shell))) assert([...SHELL_RESOURCES, ...SHELL_OPTIONAL_RESOURCES].includes(dependency), 'Shell is missing ' + dependency);
assert(fs.readFileSync(path.join(root, 'components/Header.tsx'), 'utf8').includes('if (!workOrder || !shift) return notification.title;'), 'Optional notification enrichment must retain its server-title fallback');
console.log(pages + ' page policies cover current screens, nested forms, lookups and mutation prerequisites.');
