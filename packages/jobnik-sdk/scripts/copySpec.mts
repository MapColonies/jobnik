import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openapiFilePath } from 'jobnik-openapi';

// Stages a local copy of the specification, resolved through jobnik-openapi, next to the
// SDK's own source. The SDK ships this copy in its build output and parses it at runtime,
// so a physical file has to exist here for both `build` and `test` to find it.
const destination = fileURLToPath(new URL('../src/openapi3.yaml', import.meta.url));

copyFileSync(openapiFilePath, destination);
