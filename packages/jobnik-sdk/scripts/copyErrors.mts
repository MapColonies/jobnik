import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorsFilePath } from 'jobnik-openapi';

// Stages a local copy of the generated error classes/mapping, resolved through jobnik-openapi,
// next to the SDK's own source. The SDK ships this copy in its build output and imports it at
// runtime, so a physical file has to exist here — jobnik-openapi is private and never published,
// so the SDK can't depend on it at runtime once installed by a real consumer.
const destinationDir = fileURLToPath(new URL('../src/generated', import.meta.url));
const destination = fileURLToPath(new URL('../src/generated/openapi-errors.ts', import.meta.url));

mkdirSync(destinationDir, { recursive: true });
copyFileSync(errorsFilePath, destination);
