import { Middleware } from 'openapi-fetch';
import statusCodes from 'http-status-codes';
import { APIError, JOBNIK_SDK_ERROR_CODES } from '../../errors/sdkErrors';
import { ErrorContext } from './common';

/**
 * Handles HTTP response errors based on Job Manager Service API specification
 * Only handles status codes actually defined in the OpenAPI spec: 400, 404, 500
 * Plus infrastructure errors: 502, 503, 504
 */
function handleHttpResponseError(response: Response, context: ErrorContext): void {
  const { url, method } = context;
  const statusCode = response.status;

  switch (statusCode) {
    // Infrastructure errors that can occur even if not in OpenAPI spec
    case statusCodes.BAD_GATEWAY:
      throw new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.BAD_GATEWAY,
        JOBNIK_SDK_ERROR_CODES.HTTP_BAD_GATEWAY
      );

    case statusCodes.SERVICE_UNAVAILABLE:
      throw new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.SERVICE_UNAVAILABLE,
        JOBNIK_SDK_ERROR_CODES.HTTP_SERVICE_UNAVAILABLE
      );

    case statusCodes.GATEWAY_TIMEOUT:
      throw new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.GATEWAY_TIMEOUT,
        JOBNIK_SDK_ERROR_CODES.HTTP_GATEWAY_TIMEOUT
      );
  }
}

export function createResponseMiddleware(): Exclude<Middleware['onResponse'], undefined> {
  return ({ request, response }) => {
    const context: ErrorContext = {
      url: request.url,
      method: request.method,
    };

    if (!response.ok) {
      // If response is not OK, handle it as an error
      handleHttpResponseError(response, context);
    }
  };
}
