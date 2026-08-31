import { generateErrors, generateTypes } from '@map-colonies/openapi-helpers/generators';
import { factory } from 'typescript';

const OPENAPI_PATH = 'src/openapi3.yaml';
const TYPES_DESTINATION_PATH = 'src/types/openapi.ts';
const ERRORS_DESTINATION_PATH = 'src/generated/openapi-errors.ts';

await generateTypes(OPENAPI_PATH, TYPES_DESTINATION_PATH, {
  addTypedRequestHandler: false,
  shouldFormat: true,
  inject: 'import type { JobId, StageId, TaskId } from "./brands";',
  transform(schemaObject, metadata) {
    if (metadata.path === '#/components/schemas/taskId') {
      return factory.createTypeReferenceNode('TaskId', undefined);
    }
    if (metadata.path === '#/components/schemas/jobId') {
      return factory.createTypeReferenceNode('JobId', undefined);
    }
    if (metadata.path === '#/components/schemas/stageId') {
      return factory.createTypeReferenceNode('StageId', undefined);
    }
  },
});

await generateErrors(OPENAPI_PATH, ERRORS_DESTINATION_PATH, { shouldFormat: true, includeErrorClasses: false, includeMapping: true });
