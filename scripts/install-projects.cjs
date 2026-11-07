const path=require('node:path');const {spawnSync}=require('node:child_process');const {npmCli}=require('./npm-cli.cjs');
for(const project of ['frontend','backend','mobile']){const result=spawnSync(process.execPath,[npmCli(),'ci'],{cwd:path.resolve(__dirname,'..',project),stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
