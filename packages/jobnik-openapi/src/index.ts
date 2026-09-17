export type { paths, components, operations, TypedRequestHandlers } from './openapi';
export type { Brand, JobId, StageId, TaskId } from './brands';
export {
  ValidationError,
  DatabaseRelatedError,
  UnknownError,
  JobNotFoundError,
  JobNotInFiniteStateError,
  IllegalJobStatusTransitionError,
  JobInFiniteStateError,
  StageNotFoundError,
  IllegalStageStatusTransitionError,
  StageInFiniteStateError,
  NotAllowedToAddTasksToInProgressStageError,
  TaskNotFoundError,
  TaskStatusUpdateFailedError,
  IllegalTaskStatusTransitionError,
  API_ERRORS_MAP,
} from './generated/errors';

/**
 * Absolute path to the bundled OpenAPI specification file, resolved through the module
 * system rather than through a copy of the file living next to the consumer.
 */
export const openapiFilePath: string = require.resolve('./openapi3.yaml');

/**
 * Absolute path to the generated error classes/mapping source file, for consumers (such as
 * jobnik-sdk) that need to stage a physical local copy rather than import the runtime module
 * directly — e.g. because they publish standalone and can't depend on this private package.
 */
export const errorsFilePath: string = require.resolve('./generated/errors.ts');
