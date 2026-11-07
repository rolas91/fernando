require('ts-node/register/transpile-only');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { FormSubmissionsService } = require('../src/modules/operations/services/form-submissions.service');
(async () => {
  const service = Object.create(FormSubmissionsService.prototype);
  service.numbering = { previewNextWorkOrderNumber: async () => ({ number: '000042' }) };
  const dir = resolve(__dirname, '../../output/pdf');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'work-order-readability-preview.pdf'), await service.buildPdfBuilderPreview({}));
  console.log('PDF preview generated');
})().catch((error) => { console.error(error); process.exitCode = 1; });
