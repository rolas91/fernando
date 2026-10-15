// Run the real mobile submission flow: two shift WOs in one assignment.
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, ['tmp/reproduce-shift-wo-number.cjs', '--verify-fixed'], { stdio: 'inherit', windowsHide: true });
process.exit(result.status ?? 1);
