import { generateTypes } from '@map-colonies/openapi-helpers/generators';

const OPENAPI_PATH = 'openapi3.yaml';
const TYPES_DESTINATION_PATH = 'src/openapi.d.ts';

await generateTypes(OPENAPI_PATH, TYPES_DESTINATION_PATH, {
  addTypedRequestHandler: true,
  shouldFormat: true,
});
