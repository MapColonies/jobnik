import { API_ERRORS_MAP } from '../generated/openapi-errors';

/* eslint-disable @typescript-eslint/naming-convention */
export const API_ERROR_CODES = {
  ...API_ERRORS_MAP,
  HTTP_BAD_GATEWAY: 'HTTP_BAD_GATEWAY',
  HTTP_SERVICE_UNAVAILABLE: 'HTTP_SERVICE_UNAVAILABLE',
  HTTP_GATEWAY_TIMEOUT: 'HTTP_GATEWAY_TIMEOUT',
};
/* eslint-enable @typescript-eslint/naming-convention */

export type APIErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Error constants for the Jobnik SDK.
 * These codes provide a more granular way to identify errors beyond class names or HTTP status codes.
 * @public
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const JOBNIK_SDK_ERROR_CODES = {
  ...API_ERROR_CODES,
  // Network Errors
  NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_REQUEST_CANCELLED: 'NETWORK_REQUEST_CANCELLED',
  NETWORK_REQUEST_ABORTED: 'NETWORK_REQUEST_ABORTED',
  NETWORK_HOST_UNREACHABLE: 'NETWORK_HOST_UNREACHABLE',
  NETWORK_DNS_RESOLUTION_FAILED: 'NETWORK_DNS_RESOLUTION_FAILED',
  NETWORK_SSL_ERROR: 'NETWORK_SSL_ERROR',
  NETWORK_UNKNOWN: 'NETWORK_UNKNOWN',

  // Configuration Errors
  CONFIGURATION_INVALID_URL: 'CONFIGURATION_INVALID_URL',
  CONFIGURATION_MISSING_API_KEY: 'CONFIGURATION_MISSING_API_KEY',
  CONFIGURATION_INVALID_RETRY_POLICY: 'CONFIGURATION_INVALID_RETRY_POLICY',
  CONFIGURATION_MISSING_REQUIRED_FIELD: 'CONFIGURATION_MISSING_REQUIRED_FIELD',

  TRACE_CONTEXT_EXTRACT_ERROR: 'TRACE_CONTEXT_EXTRACT_ERROR',
  REQUEST_FAILED_ERROR: 'REQUEST_FAILED_ERROR',
  EMPTY_TASK_DATA_ERROR: 'EMPTY_TASK_DATA_ERROR',
  STAGE_TYPE_MISMATCH_ERROR: 'STAGE_TYPE_MISMATCH_ERROR',

  // Job Processing Errors (General)
  JOB_PROCESSING_FAILED: 'JOB_PROCESSING_FAILED',

  // Task State Validation Errors
  TASK_INVALID_STATE_TRANSITION: 'TASK_INVALID_STATE_TRANSITION',

  FAILED_FETCHING_JOB: 'FAILED_FETCHING_JOB',
  FAILED_FETCHING_STAGE: 'FAILED_FETCHING_STAGE',

  // Generic/Unknown SDK Error
  SDK_UNKNOWN_ERROR: 'SDK_UNKNOWN_ERROR',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Type for the Jobnik SDK error codes.
 * @public
 */
export type JobnikSDKErrorCode = (typeof JOBNIK_SDK_ERROR_CODES)[keyof typeof JOBNIK_SDK_ERROR_CODES];

/**
 * Base class for all Jobnik SDK errors.
 * @public
 */
export class JobnikSDKError extends Error {
  /**
   * The name of the error, typically the class name.
   * This overrides the default 'Error' name and makes it readonly.
   * @override
   * @public
   * @readonly
   */
  public override readonly name: string;

  /**
   * A unique string code identifying the type of error.
   * @public
   * @readonly
   */
  public readonly errorCode: string;

  /**
   * Optional original error that caused this error.
   * This overrides the standard 'cause' property from ES2022 Error and makes it readonly.
   * @override
   * @public
   * @readonly
   */
  public override readonly cause?: unknown;

  /**
   * Creates an instance of JobnikSDKError.
   * @param message - The error message.
   * @param errorCode - A unique string code for this error type.
   * @param cause - Optional original error.
   */
  public constructor(message: string, errorCode: string, cause?: unknown) {
    super(message);

    // Set the name of the error to the class name of the most derived constructor.
    // This ensures that subclasses like NetworkError will have their 'name' property
    // correctly set to 'NetworkError'.
    this.name = new.target.name;
    this.errorCode = errorCode;
    this.cause = cause;

    // Set the prototype explicitly to ensure 'instanceof' works correctly for custom errors.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error class for network-related issues, such as connection problems or timeouts.
 * @public
 */
export class NetworkError extends JobnikSDKError {
  /**
   * Creates an instance of NetworkError.
   * @param message - The error message.
   * @param errorCode - A specific network error code from {@link JOBNIK_SDK_ERROR_CODES}.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, errorCode: JobnikSDKErrorCode = JOBNIK_SDK_ERROR_CODES.NETWORK_UNKNOWN, cause?: unknown) {
    super(message, errorCode, cause);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error class for configuration-related problems, like invalid settings or missing credentials.
 * @public
 */
export class ConfigurationError extends JobnikSDKError {
  /**
   * Creates an instance of ConfigurationError.
   * @param message - The error message.
   * @param errorCode - A specific configuration error code from {@link JOBNIK_SDK_ERROR_CODES}.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, errorCode: JobnikSDKErrorCode, cause?: unknown) {
    super(message, errorCode, cause);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Base error class for issues encountered while interacting with the API.
 * This class includes an HTTP status code and an optional API-specific error code.
 * @public
 */
export class APIError extends JobnikSDKError {
  /**
   * HTTP status code associated with this error.
   * @public
   * @readonly
   */
  public readonly statusCode: number;

  /**
   * Creates an instance of JobProcessingError.
   * @param message - The error message.
   * @param statusCode - HTTP status code.
   * @param errorCode - A specific job processing error code from {@link JOBNIK_SDK_ERROR_CODES}.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, statusCode: number, errorCode: APIErrorCode, cause?: unknown) {
    super(message, errorCode, cause);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProducerError extends JobnikSDKError {
  public constructor(message: string, errorCode: APIErrorCode, cause?: unknown) {
    super(message, errorCode, cause);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConsumerError extends JobnikSDKError {
  public constructor(message: string, errorCode: APIErrorCode, cause?: unknown) {
    super(message, errorCode, cause);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WorkerError extends JobnikSDKError {
  public constructor(message: string, errorCode: APIErrorCode, cause?: unknown) {
    super(message, errorCode, cause);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
