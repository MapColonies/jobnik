import statusCodes from 'http-status-codes';
import { NetworkError, APIError, JOBNIK_SDK_ERROR_CODES } from '../errors/sdkErrors';

/**
 * Normalizes HTTP status codes to prevent cardinality explosion.
 * Maps uncommon status codes to category ranges.
 */
export function normalizeStatusCode(code: number): string {
  // Common success codes
  if (code === statusCodes.OK || code === statusCodes.CREATED || code === statusCodes.NO_CONTENT) {
    return String(code);
  }

  // Client errors
  if (code === statusCodes.NOT_FOUND) return String(code);

  // Server errors
  if (
    code === statusCodes.INTERNAL_SERVER_ERROR ||
    code === statusCodes.BAD_GATEWAY ||
    code === statusCodes.SERVICE_UNAVAILABLE ||
    code === statusCodes.GATEWAY_TIMEOUT
  ) {
    return String(code);
  }

  // Catch-all for other codes
  if (code >= statusCodes.OK && code < statusCodes.MULTIPLE_CHOICES) return '2xx';
  if (code >= statusCodes.MULTIPLE_CHOICES && code < statusCodes.BAD_REQUEST) return '3xx';
  if (code >= statusCodes.BAD_REQUEST && code < statusCodes.INTERNAL_SERVER_ERROR) return '4xx';
  if (code >= statusCodes.INTERNAL_SERVER_ERROR) return '5xx';

  return 'other';
}

/**
 * Categorizes errors for metrics labeling.
 * Provides consistent error_type labels for failed tasks.
 */
export function categorizeError(error: unknown): 'timeout' | 'handler_error' | 'api_error' {
  // Check SDK error types first
  if (error instanceof NetworkError) {
    const errorCode = error.errorCode;

    // Timeout and cancellation errors
    if (
      errorCode === JOBNIK_SDK_ERROR_CODES.NETWORK_TIMEOUT ||
      errorCode === JOBNIK_SDK_ERROR_CODES.NETWORK_REQUEST_CANCELLED ||
      errorCode === JOBNIK_SDK_ERROR_CODES.NETWORK_REQUEST_ABORTED
    ) {
      return 'timeout';
    }

    // Other network errors are API errors
    return 'api_error';
  }

  if (error instanceof APIError) {
    return 'api_error';
  }

  // Fallback to error name/message inspection for non-SDK errors
  if (error instanceof Error) {
    const errorName = error.name.toLowerCase();
    const errorMessage = error.message.toLowerCase();

    // Timeout errors
    if (errorName === 'timeouterror' || errorMessage.includes('timeout')) {
      return 'timeout';
    }

    // Abort/cancellation errors (treated as timeout)
    if (errorName === 'aborterror' || errorMessage.includes('aborted')) {
      return 'timeout';
    }

    // Circuit breaker open (treated as API error)
    if (errorMessage.includes('breaker') || errorMessage.includes('circuit')) {
      return 'api_error';
    }
  }

  // Default to handler error (application code failure)
  return 'handler_error';
}

/**
 * Categorizes retry reasons for HTTP client metrics.
 */
export function categorizeRetryReason(error: unknown): 'status_code' | 'timeout' | 'network_error' {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('network') || message.includes('fetch') || message.includes('econnreset')) return 'network_error';
  }
  return 'status_code';
}
