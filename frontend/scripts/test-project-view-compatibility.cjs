const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const before = fs.readFileSync(path.join(__dirname, 'fixtures/projects-before-scoped-views.tsx.txt'), 'utf8');
const after = fs.readFileSync(path.join(__dirname, '../src/components/projects/ProjectsView.tsx'), 'utf8');
const names = ['NewProjectModal', 'EditProjectModal', 'calendarDays', 'navigateCalendar', 'goToToday', 'toggleSort', 'handleBoardDragStart', 'handleBoardDragOver', 'handleBoardDrop', 'handleBoardDragEnd'];
function declarations(source) {
  const sf = ts.createSourceFile('projects.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), values = {};
  const printer = ts.createPrinter({ removeComments: true });
  function walk(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(sf))) values[node.name.getText(sf)] = { text: printer.printNode(ts.EmitHint.Unspecified, node.initializer, sf).replace(/\s+/g, ' '), node, sf };
    ts.forEachChild(node, walk);
  }
  walk(sf); return values;
}
const old = declarations(before), current = declarations(after);
for (const name of names) { assert(old[name], name + ' exists in the original'); assert.equal(current[name]?.text, old[name].text, name + ' retains its existing calculation/payload'); }
const calendar = current.calendarDays.node.initializer.arguments[0].getText(current.calendarDays.sf);
const code = ts.transpileModule('const calendar = ' + calendar, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
function days(date, mode) { return new Function('calendarDate', 'calendarMode', code + '; return calendar();')(date, mode); }
for (const date of [new Date(2026, 10, 1, 12), new Date(2026, 4, 17, 12), new Date(2027, 0, 1, 12), new Date(2028, 1, 15, 12)]) {
  const week = days(date, 'week'), month = days(date, 'month');
  assert.equal(week.length, 7); assert.equal(month.length % 7, 0); assert(month.length <= 42); assert.equal(month[0].getDay(), 0); assert.equal(month.at(-1).getDay(), 6);
  assert.equal(month.filter(day => day.getMonth() === date.getMonth()).length, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
  for (let i=1;i<month.length;i++) { const next = new Date(month[i-1]); next.setDate(next.getDate()+1); assert.equal(month[i].getTime(), next.getTime()); }
}
console.log('Projects: New/Edit dialogs, status drag payloads, sorting controls and week/month date calculations remain unchanged; month boundaries, adjacent days and leap years passed.');
