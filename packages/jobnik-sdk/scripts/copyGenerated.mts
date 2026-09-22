import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorsFilePath, openapiFilePath } from 'jobnik-openapi';

// Stages local copies of artifacts resolved through jobnik-openapi, next to the SDK's own
// source. The SDK ships these copies in its build output and reads them at runtime —
// jobnik-openapi is private and never published, so the SDK can't depend on it at runtime
// once installed by a real consumer.
const files = [
  { from: openapiFilePath, to: fileURLToPath(new URL('../src/openapi3.yaml', import.meta.url)) },
  { from: errorsFilePath, to: fileURLToPath(new URL('../src/generated/openapi-errors.ts', import.meta.url)) },
];

for (const { from, to } of files) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
