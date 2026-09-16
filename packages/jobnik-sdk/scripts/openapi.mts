import { generateErrors } from '@map-colonies/openapi-helpers/generators';
import { openapiFilePath } from 'jobnik-openapi';

const OPENAPI_PATH = openapiFilePath;
const ERRORS_DESTINATION_PATH = 'src/generated/openapi-errors.ts';

await generateErrors(OPENAPI_PATH, ERRORS_DESTINATION_PATH, { shouldFormat: true, includeErrorClasses: false, includeMapping: true });
