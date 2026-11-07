const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const old=fs.readFileSync(path.join(__dirname,'fixtures/ShiftsView-before-paging.tsx.txt'),'utf8'),current=fs.readFileSync(path.join(__dirname,'../src/components/shifts/ShiftsView.tsx'),'utf8');
const names=['createdByLabel','relativeWeekRange','statusLabel','exportPdf','shiftType'];
function read(text){const sf=ts.createSourceFile('shifts.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),result={},printer=ts.createPrinter({removeComments:true});function visit(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(sf)))result[node.name.getText(sf)]=printer.printNode(ts.EmitHint.Unspecified,node.initializer,sf).replace(/\s+/g,' ');ts.forEachChild(node,visit);}visit(sf);return result;}
const previous=read(old),next=read(current);for(const name of names){assert(previous[name],name+' existed');assert.equal(next[name],previous[name],name+' retains its behavior');}
console.log('Shifts keeps the existing status labels, creator fallback, week ranges, shift-type labels and PDF export payload/validation.');
