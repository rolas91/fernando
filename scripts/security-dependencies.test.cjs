const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const semver=require('semver');
const root=path.resolve(__dirname,'..');
function lock(project){return JSON.parse(fs.readFileSync(path.join(root,project,'package-lock.json'))).packages;}
function requireMinimum(packages,name,minimum,major){
  const matches=Object.entries(packages).filter(([key])=>key.endsWith('/node_modules/'+name)||key==='node_modules/'+name);
  assert(matches.length, name+' is missing');
  for(const [key,pkg]of matches){
    if(major!==undefined&&semver.major(pkg.version)!==major)continue;
    assert(semver.gte(pkg.version,minimum),key+'@'+pkg.version+' is older than '+minimum);
  }
}
test('backend network and upload dependencies retain patched revisions',()=>{
  const packages=lock('backend');
  for(const [name,version]of Object.entries({'proxy-addr':'2.0.8',express:'5.3.0',multer:'2.5.0','body-parser':'2.4.0',qs:'6.17.1','engine.io':'6.6.10','socket.io-parser':'4.2.7',sharp:'0.35.5'}))requireMinimum(packages,name,version);
  requireMinimum(packages,'ws','8.21.0',8);
});
test('web and mobile Socket.IO clients retain patched protocol parsers',()=>{
  for(const project of ['frontend','mobile']){
    const packages=lock(project);
    requireMinimum(packages,'socket.io-client','4.8.4');
    requireMinimum(packages,'socket.io-parser','4.2.7');
    requireMinimum(packages,'engine.io-client','6.6.7');
    requireMinimum(packages,'ws','8.21.0',8);
  }
});
