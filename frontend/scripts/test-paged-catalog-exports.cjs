const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
async function check(folder, file) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components', folder, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let action, escape;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleExport') action = node.initializer.getText(ast); if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'escapeCsvValue') escape = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast);
  assert(action, 'Export action must exist');
  const code = ts.transpileModule((escape ? 'const escapeCsvValue = ' + escape + ';' : '') + 'const handleExport = ' + action + ';', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const rows = Array.from({ length: 75 }, (_, i) => ({ firstName: 'Item ' + i, lastName: 'Test', id: 'm' + i, identifier: 'EQ-' + i, name: 'Item ' + i, type: 'Cone', brand: 'Brand', status: 'available', sku: 'SKU-' + i, price: 12 }));
  let blob, clicked = 0;
  const run = new Function('catalog', 'Blob', 'URL', 'document', code + '; return handleExport;');
  const url = { createObjectURL: (value) => { blob = value; return 'test-blob'; }, revokeObjectURL: () => {} };
  const document = { createElement: () => ({ click: () => clicked++ }) };
  await run({ exportAll: async () => rows }, Blob, url, document)();
  const lines = (await blob.text()).split('\n');
  assert.equal(lines.length, 76, 'Export must contain all filtered records, not only 25 displayed rows');
  assert(lines.at(-1).includes('Item 74'));
  assert.equal(clicked, 1);
  await run({ exportAll: async () => null }, Blob, url, document)();
  assert.equal(clicked, 1, 'Failed exports must not download an empty file');
  console.log(folder + ': all filtered rows exported and failure preserved.');
}
(async () => { await check('equipment', 'EquipmentView.tsx'); await check('materials', 'MaterialsView.tsx'); await check('workers', 'WorkersView.tsx'); })().catch((error) => { console.error(error); process.exitCode = 1; });
