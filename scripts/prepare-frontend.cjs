const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const frontendDist = path.resolve(backendRoot, '../frontend/dist');
const publicDir = path.resolve(backendRoot, 'public');

if (!fs.existsSync(frontendDist)) {
  console.error(
    `[prepare:frontend] No existe frontend dist en: ${frontendDist}\n` +
      'Ejecuta primero: cd ../frontend && npm run build',
  );
  process.exit(1);
}

if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}

fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(frontendDist, publicDir, { recursive: true });

console.log(`[prepare:frontend] Copiado: ${frontendDist} -> ${publicDir}`);
