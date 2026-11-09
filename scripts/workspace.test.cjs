const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {test}=require('node:test');const YAML=require('yaml');const root=path.resolve(__dirname,'..');const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
test('only master can publish images; CI can deploy dev but never production',()=>{
  const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/ci-deploy.yml'),'utf8'));
  for(const role of ['api','web']){
    const publish=workflow.jobs[role].steps.find(step=>step.id==='publish');
    assert(publish.if.includes("github.ref == 'refs/heads/master'"));
    assert(!publish.if.includes('pull_request'));
  }
  assert(!workflow.jobs.deploy_api);assert(!workflow.jobs.deploy_web);
  assert(workflow.jobs.deploy_dev.if.includes("ENABLE_DEV_DEPLOY == 'true'"));
  assert(workflow.jobs.deploy_dev.if.includes("github.ref == 'refs/heads/master'"));
  assert.equal(workflow.jobs.deploy_dev.environment.name,'dev');
});
test('Nx targets execute real scripts without merging application installations',()=>{const pkg=read('package.json');assert(!pkg.workspaces);assert(pkg.devDependencies.nx);for(const project of ['frontend','backend','mobile']){const config=read(project+'/project.json'),app=read(project+'/package.json');assert.equal(config.name,project);for(const [name,target] of Object.entries(config.targets)){const parts=target.options.command.split(' ');assert.equal(parts[2],project);assert(app.scripts[parts[3]],project+':'+name+' missing script');if(target.continuous)assert.equal(target.cache,false);}}});
test('local launcher cannot inherit a production database or automatic schema synchronization',()=>{const {localEnv}=require('./local-env.cjs');const env=localEnv({LOCAL_DB_PASSWORD:'local',LOCAL_JWT_SECRET:'local-jwt'}, {DB_HOST:'remote-production',DB_NAME:'production',DB_SYNCHRONIZE:'true'});assert.equal(env.DB_HOST,'127.0.0.1');assert.equal(env.DB_NAME,'workops_local');assert.equal(env.DB_PORT,'5433');assert.equal(env.DB_SYNCHRONIZE,'false');assert.throws(()=>localEnv({LOCAL_DB_PASSWORD:'x',LOCAL_JWT_SECRET:'x',LOCAL_DB_PORT:'5432; unsafe'}));});
test('monorepo export excludes nested repositories, runtime files and credentials',()=>{const {excluded,collect}=require('./prepare-monorepo.cjs');for(const file of ['backend/.env','frontend/.env.production','mobile/.env.local','backend/public/customer.pdf','backend/workspace/package.json','frontend/.git/config','mobile/google-services.json','mobile/signing.key','backend/.github/workflows/ci-deploy.yml'])assert(excluded(file),file);for(const file of ['.env.docker.example','backend/deploy/.env.production.example','frontend/public/favicon.ico','mobile/app.json','.github/workflows/ci-deploy.yml'])assert(!excluded(file),file);if(fs.existsSync(path.join(root,'frontend/.git'))){const files=collect();assert(files.includes('frontend/package.json'));assert(files.includes('backend/package.json'));assert(files.includes('mobile/package.json'));assert(files.includes('.github/workflows/ci-deploy.yml'));assert(!files.some(excluded));}});
test('root workflows verify all applications and pin actions without production side effects',()=>{
 const workflow=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/ci-deploy.yml'),'utf8'));
 assert.equal(workflow.permissions.contents,'read');assert.deepEqual(workflow.on.push.branches,['master']);
 assert(workflow.jobs.ci.steps.some(s=>s.run==='npm test'));assert(workflow.jobs.ci.steps.some(s=>s.run==='npm run check:workspace'));
 for(const role of ['api','web']){const job=workflow.jobs[role];assert.equal(job.needs,'ci');const identity=job.steps.find(s=>s.id==='identity');assert(identity.run.includes('GITHUB_REPOSITORY,,'));assert(identity.run.includes('-'+role));for(const s of job.steps.filter(s=>s.uses?.startsWith('docker/build-push-action@')))assert.equal(s.with.context,role==='api'?'./backend':'./frontend');}
 const promote=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/promote-production.yml'),'utf8'));
 assert(promote.on.workflow_dispatch);assert(!promote.on.push);assert(!promote.on.pull_request);
 assert.equal(promote.on.workflow_dispatch.inputs.validated_in_dev.default,false);
 assert.equal(promote.jobs.production.environment.name,'production');assert.equal(promote.jobs.production.needs,'validate');
 assert(promote.jobs.production.if.includes("github.ref == 'refs/heads/master'"));
 for(const w of [workflow,promote])for(const job of Object.values(w.jobs))for(const step of job.steps)if(step.uses)assert(/@[a-f0-9]{40}$/.test(step.uses),step.uses);
 assert(!JSON.stringify(workflow).includes('DEPENDENCIES_READ_TOKEN'));
 const eas=YAML.parse(fs.readFileSync(path.join(root,'.github/workflows/eas-build.yml'),'utf8'));assert.equal(eas.jobs.build.defaults.run['working-directory'],'mobile');
});
test('Docker preserves production uploads and separates local PostgreSQL from the existing production database',()=>{const local=YAML.parse(fs.readFileSync(path.join(root,'compose.yml'),'utf8'),{merge:true}),prod=YAML.parse(fs.readFileSync(path.join(root,'backend/deploy/compose.production.yml'),'utf8'),{merge:true});assert.equal(local.services.api.environment.DB_HOST,'db');assert.equal(local.services.api.environment.DB_NAME,'workops_local');assert(!prod.services.db);assert.equal(prod.services.api.environment.DB_SYNCHRONIZE,'false');assert(prod.services.api.volumes.includes('uploads:/app/public'));assert.equal(prod.services.migrate.profiles[0],'tools');assert(!fs.readFileSync(path.join(root,'backend/Dockerfile.production'),'utf8').includes('run-migrations.js &&'));});
