import { generateErrors } from '@map-colonies/openapi-helpers/generators';
import { openapiFilePath } from 'jobnik-openapi';

const ERRORS_DESTINATION_PATH = 'src/common/generated/errors.ts';

await generateErrors(openapiFilePath, ERRORS_DESTINATION_PATH, {
  shouldFormat: true,
  includeMapping: false,
  includeErrorClasses: true,
});
