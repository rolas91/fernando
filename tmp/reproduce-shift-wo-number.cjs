const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });
const base = 'http://127.0.0.1:3001/api';
const run = 'qa-shift-number-' + Date.now();
const email = run + '@example.test';
const password = randomBytes(24).toString('base64url');
const out = path.resolve('../output/pdf', run);
fs.mkdirSync(out, { recursive: true });
const result = { run, results: [] };
const verifyFixed = process.argv.includes('--verify-fixed');
let token;
async function api(route, method='GET', body) {
  const response = await fetch(base+route, { method, headers: {'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{})}, body: body===undefined?undefined:JSON.stringify(body) });
  if(!response.ok) throw new Error(route+': '+response.status+' '+await response.text());
  return response.json();
}
(async()=>{
  assert.ok(['localhost','127.0.0.1'].includes(process.env.DB_HOST));
  const seed=spawnSync(process.execPath,['dist/database/seed-iam.js'], { env:{...process.env,ADMIN_EMAIL:email,ADMIN_PASSWORD:password,DB_SYNCHRONIZE:'false',SMTP_HOST:'',TWILIO_ACCOUNT_SID:'',SPACES_ENDPOINT:''}, encoding:'utf8',windowsHide:true,timeout:60000 });
  assert.equal(seed.status,0,'Temporary QA seed');
  token=(await api('/auth/login','POST',{email,password})).access_token;
  const settings=await api('/company-settings/default');
  result.settings={template:settings.workOrderNumberTemplate,padding:settings.workOrderNumberPadding};
  result.previewBefore=await api('/numbering/work-orders/preview');
  const templateId='work_order_daily_completion';
  const parent=await api('/work-orders','POST',{id:run,title:'QA same assignment, two shift WOs',orderNumber:'ASN-2026-001',startDate:'2026-10-15',endDate:'2026-10-16',shifts:[1,2].map(i=>({id:run+'-shift-'+i,date:i===1?'2026-10-15':'2026-10-16',shiftName:'QA Shift '+i,startTime:'08:00',endTime:'16:00',roles:[],formTemplateIds:[templateId]}))});
  const workerId=run+'-worker';
  await api('/workers','POST',{id:workerId,firstName:'QA',lastName:'Shift Numbering',email:run+'-worker@example.test',phone:'(415) 555-0100',type:'Full Time',role:'Flagger',status:'active',hourlyRate:0,createAppUser:false});
  const signature={type:'signature-path',width:600,height:220,strokes:[[{x:30,y:130},{x:100,y:70},{x:160,y:130}]]};
  for(const i of [1,2]) {
    const submission=await api('/form-submissions','POST',{id:run+'-submission-'+i,templateId,workOrderId:run,shiftId:run+'-shift-'+i,status:'submitted',data:{dr_traffic_job_number:'QA',work_date:i===1?'2026-10-15':'2026-10-16',job_name:'SAME ASSIGNMENT / SHIFT '+i,description_of_work:'Reproduce repeated WO number from the mobile submission endpoint.',client:'QA TEST',work_shift:'Day Shift',worker_timesheets:[{workerId,workerName:'QA Shift Numbering',startTime:'08:00',endTime:'16:00',regularHours:8,lunchTaken:true,breakMinutes:30,signature}],worker_signature:signature,completion_confirmation:true,notes:'TEST ONLY - NOT FOR BILLING'}});
    const url=new URL(submission.pdfUrl,'http://127.0.0.1:3001');
    assert.equal(url.origin,'http://127.0.0.1:3001');
    const response=await fetch(url); assert.equal(response.status,200);
    const pdf=Buffer.from(await response.arrayBuffer());
    const file='shift-'+i+'.pdf'; fs.writeFileSync(path.join(out,file),pdf);
    result.results.push({shiftId:submission.shiftId,submissionId:submission.id,assignmentNumber:parent.orderNumber,submissionNumber:submission.workOrderNumber??null,repeatsAssignmentNumber:pdf.toString('latin1').includes(parent.orderNumber),pdfUrl:submission.pdfUrl,file});
    if(verifyFixed) {
      assert.match(submission.workOrderNumber,/^\d{6}$/);
      assert.ok(pdf.toString('latin1').includes(submission.workOrderNumber));
      assert.ok(!pdf.toString('latin1').includes(parent.orderNumber));
    }
  }
  result.previewAfter=await api('/numbering/work-orders/preview');
  result.reproduced=result.results.every(r=>r.repeatsAssignmentNumber)&&result.previewBefore.number===result.previewAfter.number;
  if(verifyFixed) {
    assert.equal(result.results[0].submissionNumber,result.previewBefore.number);
    assert.notEqual(result.results[0].submissionNumber,result.results[1].submissionNumber);
    assert.notEqual(result.results[0].pdfUrl,result.results[1].pdfUrl);
    const first=result.results[0];
    const regenerated=await Promise.all([1,2].map(()=>api('/form-submissions/'+first.submissionId+'/regenerate-pdf','POST',{})));
    regenerated.forEach(s=>assert.equal(s.workOrderNumber,first.submissionNumber));
    const updated=await api('/form-submissions/'+first.submissionId,'PATCH',{status:'submitted'});
    assert.equal(updated.workOrderNumber,first.submissionNumber);
    assert.equal((await api('/numbering/work-orders/preview')).number,result.previewAfter.number);
    const retained=await fetch(new URL(first.pdfUrl,'http://127.0.0.1:3001'));
    assert.equal(retained.status,200);
    const pdf=Buffer.from(await retained.arrayBuffer());
    assert.ok(pdf.toString('latin1').includes(first.submissionNumber));
    fs.writeFileSync(path.join(out,'shift-1-regenerated.pdf'),pdf);
    result.fixedVerified=true;
    result.editAndConcurrentRegenerationPreserveNumber=true;
  }
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{result.error=e.message;console.error(e.message);process.exitCode=1;}).finally(async()=>{
  const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  try{await c.connect();await c.query('DELETE FROM users WHERE email=$1',[email]);}catch(e){result.cleanupError=e.message;}finally{await c.end();}
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(result,null,2));
  console.log('Evidence:',out);
});
