import type { Middleware } from 'openapi-fetch';
import statusCodes from 'http-status-codes';
import { NetworkError, JOBNIK_SDK_ERROR_CODES, APIError } from '../../errors/sdkErrors';
import { ErrorContext } from './common';

function isObjectWithMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string';
}

/**
 * Handles network-level errors (connection issues, timeouts, etc.)
 */
const handleNetworkError = (error: unknown, context: ErrorContext): Error => {
  const { url, method } = context;

  if (isObjectWithMessage(error) && error.message.includes('fetch failed')) {
    // Parse common network error patterns
    if ('cause' in error && isObjectWithMessage(error.cause)) {
      const originalError = error.cause;
      const message = originalError.message;

      if (message.includes('ECONNREFUSED') || message.includes('Connection refused')) {
        return new NetworkError(`Failed to connect to ${url}: Connection refused`, JOBNIK_SDK_ERROR_CODES.NETWORK_CONNECTION_REFUSED, originalError);
      }

      if (message.includes('ETIMEDOUT') || message.includes('timeout') || message.includes('ENOTFOUND')) {
        if (message.includes('ENOTFOUND')) {
          return new NetworkError(`DNS resolution failed for ${url}`, JOBNIK_SDK_ERROR_CODES.NETWORK_DNS_RESOLUTION_FAILED, originalError);
        }
        return new NetworkError(`Request to ${url} timed out`, JOBNIK_SDK_ERROR_CODES.NETWORK_TIMEOUT, originalError);
      }

      if (message.includes('EHOSTUNREACH') || message.includes('Host unreachable')) {
        return new NetworkError(`Host unreachable: ${url}`, JOBNIK_SDK_ERROR_CODES.NETWORK_HOST_UNREACHABLE, originalError);
      }

      if (message.includes('SSL') || message.includes('TLS') || message.includes('certificate')) {
        return new NetworkError(`SSL/TLS error when connecting to ${url}`, JOBNIK_SDK_ERROR_CODES.NETWORK_SSL_ERROR, originalError);
      }

      // Handle AbortError (request cancelled/aborted)
      if (message.includes('Request was cancelled')) {
        if (
          'cause' in originalError &&
          isObjectWithMessage(originalError.cause) &&
          originalError.cause.message.includes('This operation was aborted')
        ) {
          return new NetworkError(`Request to ${method} ${url} was aborted`, JOBNIK_SDK_ERROR_CODES.NETWORK_REQUEST_ABORTED, originalError);
        }

        return new NetworkError(`Request to ${method} ${url} was cancelled`, JOBNIK_SDK_ERROR_CODES.NETWORK_REQUEST_CANCELLED, error);
      }
    }
    // Generic network error for unmatched cases
    return new NetworkError(`Network error when requesting ${method} ${url}: ${error.message}`, JOBNIK_SDK_ERROR_CODES.NETWORK_UNKNOWN, error);
  }

  // Fallback for unknown errors
  const errorMessage = error instanceof Error ? error.message : String(error);
  return new NetworkError(`Unexpected error during ${method} ${url}: ${errorMessage}`, JOBNIK_SDK_ERROR_CODES.NETWORK_UNKNOWN, error);
};

const handleHttpError = (originalError: unknown, context: ErrorContext): Error | void => {
  const { url, method } = context;

  if (!(
    isObjectWithMessage(originalError) &&
    'cause' in originalError &&
    isObjectWithMessage(originalError.cause) &&
    'statusCode' in originalError.cause &&
    typeof originalError.cause.statusCode === 'number'
  )) {
    return;
  }

  const statusCode = originalError.cause.statusCode;

  // Job Manager Service API defined status codes
  switch (statusCode) {
    // Infrastructure errors that can occur even if not in OpenAPI spec
    case statusCodes.BAD_GATEWAY:
      return new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.BAD_GATEWAY,
        JOBNIK_SDK_ERROR_CODES.HTTP_BAD_GATEWAY
      );
    case statusCodes.SERVICE_UNAVAILABLE:
      return new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.SERVICE_UNAVAILABLE,
        JOBNIK_SDK_ERROR_CODES.HTTP_SERVICE_UNAVAILABLE
      );
    case statusCodes.GATEWAY_TIMEOUT:
      return new APIError(
        `Service temporarily unavailable for ${method} ${url}. Please retry later.`,
        statusCodes.GATEWAY_TIMEOUT,
        JOBNIK_SDK_ERROR_CODES.HTTP_GATEWAY_TIMEOUT
      );

    default:
      return new NetworkError(`Unexpected status code ${statusCode} for ${method} ${url}`, JOBNIK_SDK_ERROR_CODES.NETWORK_UNKNOWN, originalError);
  }
};

/**
 * Simplified error handling middleware for the Job Manager Service API client.
 * Handles only the error cases defined in the OpenAPI specification plus infrastructure errors.
 */
export const createErrorHandlingMiddleware = (): Exclude<Middleware['onError'], undefined> => {
  return ({ request, error }) => {
    const context: ErrorContext = {
      url: request.url,
      method: request.method,
    };

    const res = handleHttpError(error, context);

    if (res instanceof Error) {
      return res;
    }

    // Handle network-level errors and other error types
    return handleNetworkError(error, context);
  };
};
