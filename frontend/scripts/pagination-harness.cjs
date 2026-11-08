const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8').replaceAll('import.meta.env', '({})');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
function paginationHarness() {
  let slots = [], cursor = 0, effects = [], changed = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) changed = true; slots[index] = value; }];
    },
    useCallback(fn, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !same(slots[index], deps)) effects.push(fn); slots[index] = deps; },
  };
  const hook = load('hooks/use-pagination-state.ts', { react, '@/lib/pagination': load('lib/pagination.ts') }).usePaginationState;
  return (...args) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; effects = []; changed = false;
      const result = hook(...args);
      effects.forEach(fn => fn());
      if (!changed) return result;
    }
    throw Error('Pagination did not settle');
  };
}
module.exports = { load, paginationHarness };
