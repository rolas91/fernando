const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const printer = ts.createPrinter({ removeComments: true });
function read(file) {
 const ast = ts.createSourceFile(file,fs.readFileSync(path.join(__dirname,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const callbacks=[];
 function visit(n) {
  if(ts.isVariableDeclaration(n) && n.name.getText(ast) !== 'openShiftChatById' && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast)==='useCallback') callbacks.push(printer.printNode(ts.EmitHint.Unspecified,n,ast));
  ts.forEachChild(n,visit);
 }
 visit(ast);return callbacks;
}
let callbacks=0;
for(const name of ['scheduler/SchedulerCalendarView','scheduler/AssignmentDetailSidebar','workorders/WorkOrdersView']) {
 const before=read('fixtures/'+name.split('/').pop()+'-before-document-reads.tsx.txt');
 const after=read('../src/components/'+name+'.tsx');
 assert.deepEqual(after,before,name+' actions and validations');callbacks+=after.length;
}
const completion = fs.readFileSync(path.join(__dirname,'../src/lib/shiftCompletion.ts'),'utf8');
const mod={exports:{}};
new Function('require','module','exports',ts.transpileModule(completion,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({isFutureShiftDate: date => date>'2026-11-06'}),mod,mod.exports);
const templates=[{id:'required',isRequired:true},{id:'optional',isRequired:false},{id:'second'}];
const orders=[{id:'wo',shifts:[
 {id:'done',date:'2026-11-05',formTemplateIds:['required','optional']},
 {id:'missing',date:'2026-11-05',formTemplateIds:['required','second']},
 {id:'future',date:'2026-11-07',formTemplateIds:['required']},
 {id:'none',date:'2026-11-05',formTemplateIds:[]},
 {id:'draft',date:'2026-11-05',formTemplateIds:['required']},
]}];
const submissions=['done','missing','future','draft'].map(shiftId=>({id:shiftId,shiftId,workOrderId:'wo',templateId:'required',status:shiftId==='draft'?'draft':'submitted',data:{signature:'private'},pdfUrl:'pdf'}));
submissions.push({...submissions[0],id:'duplicate'});
const minimal=submissions.filter(s=>s.status==='submitted').map(({id,shiftId,workOrderId,templateId,status})=>({id,shiftId,workOrderId,templateId,status}));
const build=mod.exports.buildCompletedWorkOrderShiftKeys;
assert.deepEqual([...build(submissions,templates,orders)],['wo:done']);
assert.deepEqual([...build(minimal,templates,orders)],[...build(submissions,templates,orders)]);
const calendar=fs.readFileSync(path.join(__dirname,'../src/components/scheduler/SchedulerCalendarView.tsx'),'utf8');
assert(calendar.includes('if (!submissionIndex.data) return <DocumentReadNotice'),'Never unlock controls with missing completion data');
console.log(callbacks+' action callbacks unchanged; compact completion matches legacy required-form rules.');
