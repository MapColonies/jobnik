import { join } from 'node:path';
import { bundle } from '@readme/openapi-parser';
import type { FetchResponse, MaybeOptionalInit, Client } from 'openapi-fetch';
import type { HttpMethod, MediaType, PathsWithMethod, RequiredKeysOf } from 'openapi-typescript-helpers';
import { SpanStatusCode } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';
import type { OpenAPIV3 } from 'openapi-types';
import type { paths } from '../types';
import { tracer } from '../telemetry/trace';

type InitParam<Init> = RequiredKeysOf<Init> extends never ? [(Init & { [key: string]: unknown })?] : [Init & { [key: string]: unknown }];

function extractIdFromRequest(params: { query?: Record<string, unknown>; path?: Record<string, unknown> }): {
  jobId?: string;
  stageId?: string;
  taskId?: string;
} {
  const result: { jobId?: string; stageId?: string; taskId?: string } = {};

  const jobId = params.path?.jobId ?? params.query?.jobId;
  if (typeof jobId === 'string') {
    result.jobId = jobId;
  }

  const stageId = params.path?.stageId ?? params.query?.stageId;
  if (typeof stageId === 'string') {
    result.stageId = stageId;
  }

  const taskId = params.path?.taskId ?? params.query?.taskId;
  if (typeof taskId === 'string') {
    result.taskId = taskId;
  }

  return result;
}

/**
 * Cache for the parsed OpenAPI specification
 */
let openApiSpec: Record<string, Record<string, string>> | null = null;

/**
 * Lazily loads and parses the OpenAPI specification
 */
async function getOpenApiSpec(): Promise<Record<string, Record<string, string>>> {
  if (openApiSpec === null) {
    try {
      const openApiPath = join(__dirname, '../openapi3.yaml');

      // Use @readme/openapi-parser to bundle and resolve all references
      const bundledSpec = await bundle(openApiPath);

      openApiSpec = extractOperationIds(bundledSpec as OpenAPIV3.Document);
      /* c8 ignore next 4 */
    } catch {
      openApiSpec = {};
    }
  }
  return openApiSpec;
}

/**
 * Extracts operationIds from the bundled OpenAPI specification
 */
function extractOperationIds(spec: OpenAPIV3.Document): Record<string, Record<string, string>> {
  const pathOperations: Record<string, Record<string, string>> = {};

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    pathOperations[path] = {};

    // Check each HTTP method
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
    for (const method of methods) {
      const operation = pathItem?.[method];
      if (operation?.operationId !== undefined && typeof operation.operationId === 'string') {
        pathOperations[path][method] = operation.operationId;
      }
    }
  }

  return pathOperations;
}

/**
 * Extracts operationId from the OpenAPI spec based on method and path
 */
async function getOperationId(method: string, path: string): Promise<string | undefined> {
  const spec = await getOpenApiSpec();
  const pathOps = spec[path];
  return pathOps?.[method.toLowerCase()];
}

async function wrapWithSpan<
  Method extends HttpMethod,
  Path extends PathsWithMethod<paths, Method>,
  Init extends MaybeOptionalInit<paths[Path], Method>,
  Media extends MediaType = MediaType,
>(
  request: Client<paths>['request'],
  method: Method,
  path: Path,
  ...init: InitParam<Init>
): Promise<FetchResponse<Exclude<paths[Path][Method], undefined>, Init, Media>> {
  return tracer.startActiveSpan(`API Request: ${method.toUpperCase()} ${path}`, async (span) => {
    try {
      if (init.length > 0 && init[0]?.params) {
        const ids = extractIdFromRequest(init[0].params);
        span.setAttributes(ids);
      }

      const operationId = await getOperationId(method, path);
      if (operationId !== undefined) {
        span.setAttribute('api.operation_id', operationId);
      }

      //@ts-expect-error im not sure why typescript hates me here (╯°□°）╯︵ ┻━┻
      const result = await request(method, path, ...init);

      if (result.response.status < Number(StatusCodes.BAD_REQUEST)) {
        span.setStatus({
          code: SpanStatusCode.OK,
        });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });
      }

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `Request failed with error: ${error instanceof Error ? error.message : String(error)}`,
      });
      throw error; // Re-throw the error after setting the span status
    } finally {
      span.end();
    }
  });
}

export function wrapClient(client: Client<paths>): Client<paths> {
  // This function can be used to wrap the client with additional functionality if needed
  const originalRequest = client.request.bind(client);

  /* eslint-disable @typescript-eslint/explicit-function-return-type */
  client.request = async (method, path, ...init) => {
    return wrapWithSpan(originalRequest, method, path, ...init);
  };

  client.GET = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'get', path, ...init);
  };

  client.POST = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'post', path, ...init);
  };

  client.PUT = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'put', path, ...init);
  };

  client.PATCH = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'patch', path, ...init);
  };

  client.DELETE = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'delete', path, ...init);
  };

  client.OPTIONS = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'options', path, ...init);
  };

  client.HEAD = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'head', path, ...init);
  };

  client.TRACE = async (path, ...init) => {
    return wrapWithSpan(originalRequest, 'trace', path, ...init);
  };
  /* eslint-enable @typescript-eslint/explicit-function-return-type */

  return client;
}
