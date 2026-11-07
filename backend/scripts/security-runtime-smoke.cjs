// Run via `docker compose exec -T api node < backend/scripts/security-runtime-smoke.cjs`.
// All requests stay on loopback; this never touches the application's database or external integrations.
const assert=require('node:assert/strict');
const express=require('express');
const multer=require('multer');
const sharp=require('sharp');
async function main(){
  const app=express();
  app.use(express.json({limit:'1kb'}));
  app.get('/check/:id',(req,res)=>res.json({id:req.params.id,query:req.query}));
  app.post('/json',(req,res)=>res.json(req.body));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4,files:1},fileFilter:(_req,file,done)=>done(file.mimetype==='image/png'?null:new Error('TYPE_REJECTED'),file.mimetype==='image/png')});
  app.post('/upload',upload.single('file'),(req,res)=>res.json({name:req.file.originalname,size:req.file.size,label:req.body.label}));
  app.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({code:error.code||error.message}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(route,options={})=>fetch(base+route,{...options,signal:AbortSignal.timeout(10000)});
  try{
    let r=await request('/check/shift-13?week=2026-11-09&page=2');
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:'shift-13',query:{week:'2026-11-09',page:'2'}});
    r=await request('/json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shiftId:'shift-13',status:'ready'})});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{shiftId:'shift-13',status:'ready'});
    r=await request('/json',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(r.status,400);
    r=await request('/json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({large:'x'.repeat(2048)})});assert.equal(r.status,413);
    const form=new FormData();form.set('label','test');form.set('file',new Blob(['png'],{type:'image/png'}),'logo.png');
    r=await request('/upload',{method:'POST',body:form});assert.equal(r.status,200);assert.deepEqual(await r.json(),{name:'logo.png',size:3,label:'test'});
    const oversized=new FormData();oversized.set('file',new Blob(['12345'],{type:'image/png'}),'large.png');
    r=await request('/upload',{method:'POST',body:oversized});assert.equal(r.status,400);assert.equal((await r.json()).code,'LIMIT_FILE_SIZE');
    const wrongType=new FormData();wrongType.set('file',new Blob(['txt'],{type:'text/plain'}),'file.txt');
    r=await request('/upload',{method:'POST',body:wrongType});assert.equal(r.status,400);assert.equal((await r.json()).code,'TYPE_REJECTED');
    const png=await sharp({create:{width:16,height:16,channels:4,background:{r:200,g:100,b:50,alpha:1}}}).png().toBuffer();
    const resized=await sharp(png).resize(8,8).png().toBuffer();const info=await sharp(resized).metadata();assert.equal(info.width,8);assert.equal(info.height,8);assert.equal(info.format,'png');
    console.log('Express JSON/query contracts, multipart limits/filtering and native Sharp passed');
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
