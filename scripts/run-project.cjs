const path=require('node:path');const {spawn}=require('node:child_process');const {npmCli}=require('./npm-cli.cjs');
const [project,script,...args]=process.argv.slice(2);if(!['frontend','backend','mobile'].includes(project)||!script||!/^[a-z0-9:_-]+$/i.test(script))throw new Error('Usage: run-project.cjs frontend|backend|mobile script [arguments]');
if(project==='backend'&&['start:dev','start:debug'].includes(script)&&process.env.DB_SYNCHRONIZE===undefined)process.env.DB_SYNCHRONIZE='false';
if(project==='frontend'&&script==='dev'&&process.env.WORKSPACE_WEB_PORT){if(!/^\d{1,5}$/.test(process.env.WORKSPACE_WEB_PORT))throw Error('Invalid local web port');args.push('--port='+process.env.WORKSPACE_WEB_PORT);}
const child=spawn(process.execPath,[npmCli(),'run',script,...(args.length?['--',...args]:[])],{cwd:path.resolve(__dirname,'..',project),env:process.env,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
