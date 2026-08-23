export type { paths, components, operations, TypedRequestHandlers } from './openapi';

/**
 * Absolute path to the bundled OpenAPI specification file, resolved through the module
 * system rather than through a copy of the file living next to the consumer.
 */
export const openapiFilePath: string = require.resolve('./openapi3.yaml');
