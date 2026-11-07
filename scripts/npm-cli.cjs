const fs=require('node:fs');const path=require('node:path');
function npmCli(){const base=path.dirname(process.execPath);const candidates=[process.env.npm_execpath,path.join(base,'node_modules/npm/bin/npm-cli.js'),path.resolve(base,'../node_modules/npm/bin/npm-cli.js'),path.resolve(base,'../lib/node_modules/npm/bin/npm-cli.js')];const found=candidates.find(value=>value&&fs.existsSync(value)&&value.endsWith('npm-cli.js'));if(!found)throw new Error('npm CLI was not found. Run this command through npm run or install a complete Node.js LTS distribution.');return found;}
module.exports={npmCli};
