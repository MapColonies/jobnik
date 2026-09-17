import { generateErrors } from '@map-colonies/openapi-helpers/generators';

const OPENAPI_PATH = 'openapi3.yaml';
const ERRORS_DESTINATION_PATH = 'src/generated/errors.ts';

await generateErrors(OPENAPI_PATH, ERRORS_DESTINATION_PATH, { shouldFormat: true, includeErrorClasses: true, includeMapping: true });
