const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ quiet: true });
if (!['127.0.0.1','localhost'].includes(process.env.DB_HOST)) throw new Error('Local database required');
const env = { ...process.env, PORT: '3001', AUTH_DEV_BYPASS: 'false', DB_SYNCHRONIZE: 'false',
  SPACES_ENDPOINT: '', SPACES_ACCESS_KEY_ID: '', SPACES_SECRET_ACCESS_KEY: '',
  SMTP_HOST: '', TWILIO_ACCOUNT_SID: '', SENDGRID_API_KEY: '' };
const log = fs.openSync('tmp/wo-api-server.log', 'a');
const child = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
child.unref();
fs.writeFileSync('tmp/wo-api-server.pid', String(child.pid));
console.log('Local API started', { pid: child.pid, port: env.PORT });
