const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const projects = ['frontend', 'backend', 'mobile'];
const rootFiles = ['.github', '.gitattributes', '.gitignore', '.nxignore', 'package.json', 'package-lock.json', 'nx.json', 'compose.yml', '.env.docker.example', 'WORKSPACE.md', 'scripts', 'docs'];

function excluded(name) {
  const parts = name.replaceAll('\\', '/').split('/');
  const base = parts.at(-1);
  if (parts.some(p => ['.git', 'node_modules', '.nx', '.cache', '.expo', '.source-language', 'dist', 'coverage', 'tmp', 'logs', 'web-build'].includes(p))) return true;
  if (/^\.env/.test(base) && !base.endsWith('.example')) return true;
  if (/\.(pem|key|p12|p8|jks|mobileprovision|dump|log|tsbuildinfo|bak)$/i.test(base)) return true;
  if (['google-services.json', 'credentials.json', '.npmrc', '.DS_Store'].includes(base) || /service[-_]?account.*\.json/i.test(base)) return true;
  if (/^(frontend|backend|mobile)\/\.github\//.test(name)) return true;
  if (/^backend\/(public|workspace)\//.test(name) || name === 'backend/scripts/setup-workspace.cjs') return true;
  return false;
}

function collect() {
  const files = new Set();
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (excluded(relative)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw Error('Review symbolic link before export: ' + relative);
    if (stat.isDirectory()) for (const name of fs.readdirSync(absolute)) visit(relative + '/' + name);
    else files.add(relative);
  }
  for (const file of rootFiles) visit(file);
  for (const project of projects) {
    const names = execFileSync('git', ['-C', path.join(root, project), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {encoding:'utf8',maxBuffer:20*1024*1024}).split('\0').filter(Boolean);
    for (const name of names) {
      const relative = project + '/' + name;
      if (!excluded(relative) && fs.existsSync(path.join(root, relative))) visit(relative);
    }
  }
  return [...files].sort();
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write')) throw Error('Usage: npm run prepare:monorepo [-- --write]');
  const files = collect();
  console.log('Files selected for the monorepo: ' + files.length);
  if (!args.includes('--write')) { console.log('Preview only. Use --write to create a separate copy; existing repositories are never changed.'); return; }
  const destination = path.join(root, 'output', 'monorepo-' + new Date().toISOString().replaceAll(/[:.]/g, '-'));
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  // Start with the existing backend repository's history, without checking out its old root files.
  execFileSync('git', ['clone', '--no-checkout', 'https://github.com/rolas91/fernando.git', destination], {stdio:'pipe'});
  execFileSync('git', ['-C', destination, 'branch', '-m', 'migration/monorepo'], {stdio:'pipe'});
  for (const name of files) {
    const target = path.resolve(destination, name);
    if (!target.startsWith(destination + path.sep)) throw Error('Invalid export path');
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(path.join(root, name), target, fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(destination, 'MONOREPO-EXPORT.json'), JSON.stringify({createdAt:new Date().toISOString(),mode:'existing rolas91/fernando backend history plus current working files; frontend/mobile historical repositories remain unchanged',sources:Object.fromEntries(projects.map(p=>[p,execFileSync('git',['-C',path.join(root,p),'rev-parse','HEAD'],{encoding:'utf8'}).trim()])),files},null,2)+'\n');
  // Initialize only the new clone's index. --mixed leaves the copied working files untouched.
  execFileSync('git', ['-C', destination, 'reset', '--mixed', 'HEAD'], {stdio:'pipe'});
  console.log('Monorepo prepared at: ' + destination);
  console.log('No files staged, committed or pushed. Review before publishing.');
}
module.exports = { excluded, collect };
if (require.main === module) main();
