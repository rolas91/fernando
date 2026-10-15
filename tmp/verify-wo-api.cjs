const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { randomUUID, randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const base = 'http://127.0.0.1:3001';
const run = 'qa-wo-' + Date.now();
const email = run + '@example.test';
const password = randomBytes(24).toString('base64url');
const out = path.resolve('../output/pdf/wo-api-20261015');
fs.mkdirSync(out, { recursive: true });
const evidence = { run, localApi: base, results: [], requests: [] };
let token, originalBuilder, builderChanged = false;
async function api(route, method='GET', body) {
  const r = await fetch(base+'/api'+route, {method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  evidence.requests.push({method,route,status:r.status});
  if (!r.ok) throw new Error(method+' '+route+': '+r.status+' '+await r.text());
  return r;
}
async function json(route, method, body) { return (await api(route,method,body)).json(); }
async function savePdf(url,name,number) {
  const target=new URL(url,base);
  assert.equal(target.origin,base,'Only local generated files');
  const r=await fetch(target);
  assert.equal(r.status,200);
  const bytes=Buffer.from(await r.arrayBuffer());
  assert.ok(bytes.subarray(0,5).toString()==='%PDF-');
  assert.ok(bytes.toString('latin1').includes(number),'PDF contains persisted WO number');
  fs.writeFileSync(path.join(out,name),bytes);
  return {file:name,bytes:bytes.length};
}
(async()=>{
  assert.ok(['127.0.0.1','localhost'].includes(process.env.DB_HOST));
  const seed=spawnSync(process.execPath,['dist/database/seed-iam.js'],{
    env:{...process.env,ADMIN_EMAIL:email,ADMIN_PASSWORD:password,DB_SYNCHRONIZE:'false',SPACES_ENDPOINT:'',SMTP_HOST:'',TWILIO_ACCOUNT_SID:''},
    encoding:'utf8',windowsHide:true,timeout:60000,
  });
  if(seed.status!==0) throw new Error('Temporary local IAM seed failed: '+(seed.stderr||'').slice(-1500));
  const login=await json('/auth/login','POST',{email,password}); token=login.access_token;
  assert.ok(login.user.permissions.includes('form-submissions.write'));
  const settings=(await json('/company-settings')).find(s=>s.id==='default');
  evidence.initialNumbering={prefix:settings.workOrderNumberPrefix,padding:settings.workOrderNumberPadding,reset:settings.workOrderNumberReset,template:settings.workOrderNumberTemplate};
  originalBuilder=settings.workOrderPdfBuilder;
  const templateId='work_order_daily_completion';
  const builder={version:2,templateId,fields:{},layout:{filenameTemplate:'{workOrderNumber}',labels:{documentTitle:'WORK ORDER'}}};
  await json('/company-settings/default','PATCH',{workOrderPdfBuilder:builder}); builderChanged=true;
  const workerId=run+'-worker';
  await json('/workers','POST',{id:workerId,firstName:'QA',lastName:'Numbering Test',email:run+'-worker@example.test',phone:'(415) 555-0100',type:'Full Time',role:'Flagger',status:'active',hourlyRate:0,notes:'Local API numbering verification only',createAppUser:false});
  const signature={type:'signature-path',width:600,height:220,strokes:[[{x:30,y:130},{x:100,y:70},{x:160,y:130}]]};
  async function createCase(label) {
    const preview=await json('/numbering/work-orders/preview');
    const previewResponse=await api('/form-submissions/pdf-builder/preview','POST',{config:builder});
    const previewPdf=Buffer.from(await previewResponse.arrayBuffer());
    assert.ok(previewPdf.toString('latin1').includes(preview.number));
    fs.writeFileSync(path.join(out,label+'-builder-preview.pdf'),previewPdf);
    assert.equal((await json('/numbering/work-orders/preview')).number,preview.number,'Builder preview does not consume sequence');
    const id=run+'-'+label,shiftId=id+'-shift';
    const wo=await json('/work-orders','POST',{id,title:'QA API Numbering '+label,startDate:'2026-10-15',endDate:'2026-10-15',notes:'TEST ONLY - local Settings/PDF verification',shifts:[{id:shiftId,date:'2026-10-15',shiftName:'QA Day Shift',startTime:'08:00',endTime:'16:00',roles:[],formTemplateIds:[templateId]}]});
    assert.equal(wo.orderNumber,preview.number);
    const data={dr_traffic_job_number:'QA-API',work_date:'2026-10-15',job_name:'LOCAL API NUMBERING TEST',description_of_work:'Verify saved numbering settings through the actual API and final PDF.',client:'QA TEST CLIENT',contact:'QA',work_shift:'Day Shift',worker_timesheets:[{workerId,workerName:'QA Numbering Test',roleName:'Flagger',startTime:'08:00',endTime:'16:00',regularHours:8,overtimeHours:0,doubleTimeHours:0,lunchTaken:true,breakMinutes:30,signature}],worker_signature:signature,completion_confirmation:true,notes:'TEST DOCUMENT - NOT FOR BILLING',work_order_number:'ASN-2026-001'};
    const submission=await json('/form-submissions','POST',{id:id+'-submission',templateId,workOrderId:id,shiftId,status:'submitted',data});
    assert.ok(submission.pdfUrl);
    const pdf=await savePdf(submission.pdfUrl,label+'-final-'+wo.orderNumber+'.pdf',wo.orderNumber);
    const persisted=await json('/work-orders/'+id);
    assert.equal(persisted.orderNumber,wo.orderNumber);
    evidence.results.push({label,woId:id,submissionId:submission.id,previewNumber:preview.number,orderNumber:wo.orderNumber,pdfUrl:submission.pdfUrl,...pdf,nextPreview:(await json('/numbering/work-orders/preview')).number});
    console.log('PASS',label,wo.orderNumber,pdf.file);
    return submission;
  }
  const first=await createCase('before');
  await json('/company-settings/default','PATCH',{workOrderNumberPrefix:'',workOrderNumberPadding:6,workOrderNumberTemplate:'{NNNNNN}',workOrderNumberReset:'yearly'});
  const saved=await json('/company-settings/default');
  assert.equal(saved.workOrderNumberTemplate,'{NNNNNN}');
  evidence.finalNumbering={prefix:saved.workOrderNumberPrefix,padding:saved.workOrderNumberPadding,reset:saved.workOrderNumberReset,template:saved.workOrderNumberTemplate};
  await createCase('after');
  assert.match(evidence.results[1].orderNumber,/^\d{6}$/);
  const regenerated=await json('/form-submissions/'+first.id+'/regenerate-pdf','POST',{});
  await savePdf(regenerated.pdfUrl,'before-regenerated-after-settings.pdf',evidence.results[0].orderNumber);
  evidence.existingWoPreserved=true;
  evidence.success=true;
})().catch(e=>{evidence.error=e.message;console.error(e.message);process.exitCode=1;}).finally(async()=>{
  try {
    if(builderChanged) await json('/company-settings/default','PATCH',{workOrderPdfBuilder:originalBuilder});
    const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
    await c.connect();
    try { await c.query('DELETE FROM users WHERE email=$1',[email]); evidence.temporaryLoginRemoved=true; }
    finally { await c.end(); }
  }catch(e){evidence.cleanupError=e.message;console.error('Cleanup:',e.message);process.exitCode=1;}
  fs.writeFileSync(path.join(out,'api-evidence.json'),JSON.stringify(evidence,null,2));
});
