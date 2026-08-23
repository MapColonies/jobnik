import { hostname } from 'node:os';
import { Span, SpanOptions, SpanStatusCode, trace, context, SpanContext, propagation } from '@opentelemetry/api';
import { readPackageJsonSync } from '@map-colonies/read-pkg';
import { Logger } from '../types';
import { ATTR_MESSAGING_CLIENT_ID, ATTR_MESSAGING_SYSTEM } from './semconv';

// Dynamically set from package.json
const packageJson = readPackageJsonSync();
const SDK_INSTRUMENTATION_SCOPE = packageJson.name ?? 'unknown-sdk';
const SDK_VERSION = packageJson.version ?? 'unknown-version';

export const DEFAULT_SPAN_CONTEXT: SpanContext = {
  traceId: '00000000000000000000000000000000',
  spanId: '0000000000000000',
  traceFlags: 0,
};

export const BASE_ATTRIBUTES = {
  [ATTR_MESSAGING_SYSTEM]: 'jobnik',
  [ATTR_MESSAGING_CLIENT_ID]: hostname(),
};

export function getSpanContext(carrier: unknown): SpanContext | undefined {
  const remoteContext = propagation.extract(context.active(), carrier);
  return trace.getSpanContext(remoteContext);
}

export async function withSpan<T>(spanName: string, spanOptions: SpanOptions, logger: Logger, fn: (span: Span) => Promise<T>): Promise<T> {
  if (spanOptions.attributes) {
    spanOptions.attributes = { ...BASE_ATTRIBUTES, ...spanOptions.attributes };
  } else {
    spanOptions.attributes = structuredClone(BASE_ATTRIBUTES);
  }
  return tracer.startActiveSpan(spanName, spanOptions, async (span) => {
    try {
      const result = await fn(span);
      handleSpanOnSuccess(span);
      return result;
    } catch (error) {
      handleSpanOnError(span, error);
      throw error;
    }
  });
}

/**
 * Ends the given span with status OK
 * @param span span to be ended
 * @group Tracing Utilities
 */
export const handleSpanOnSuccess = (span: Span | undefined): void => {
  if (!span) {
    return;
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
};

/**
 * Ends the given span with status ERROR and records the error
 * @param span span to be ended
 * @param error error to be recorded
 * @group Tracing Utilities
 */
export const handleSpanOnError = (span: Span | undefined, error?: unknown): void => {
  if (!span) {
    return;
  }

  span.setStatus({ code: SpanStatusCode.ERROR });

  if (error instanceof Error) {
    span.recordException(error);
  }

  span.end();
};

/**
 * @remarks
 * The tracer instance for the SDK.
 * It is initialized from the global TracerProvider using the OTel API.
 * The SDK relies on the application's global OTel setup.
 *
 * @see {@link https://opentelemetry.io/docs/instrumentation/js/instrumentation/#get-a-tracer}
 */
export const tracer = trace.getTracer(SDK_INSTRUMENTATION_SCOPE, SDK_VERSION);
