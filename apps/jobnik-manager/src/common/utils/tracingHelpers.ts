import { context, propagation } from '@opentelemetry/api';

interface Carrier {
  traceparent?: string;
  tracestate?: string;
}

export const DEFAULT_TRACEPARENT = '00-00000000000000000000000000000000-0000000000000000-00';

/**
 * Type that ensures traceparent is required and tracestate is nullable
 */
export interface ResolvedTraceContext {
  readonly traceparent: string;
  readonly tracestate: string | null;
}

/**
 * Type that represents a payload with optional trace context fields
 */
export type OptionalTraceContext = Partial<ResolvedTraceContext>;

/**
 * Resolves trace context values for database operations.
 * Uses provided trace context from request if available, otherwise injects from active OpenTelemetry context.
 *
 * @param payload - Payload that may contain optional traceparent and tracestate
 * @returns Object with required traceparent string and nullable tracestate
 */
export function resolveTraceContext(payload: OptionalTraceContext): ResolvedTraceContext {
  // If user provided traceparent, use user's trace context
  if (payload.traceparent !== undefined) {
    return {
      traceparent: payload.traceparent,
      tracestate: payload.tracestate ?? null,
    };
  }

  // If user didn't provide traceparent, inject from active OpenTelemetry context
  const traceContext: Carrier = {};
  propagation.inject(context.active(), traceContext);

  return {
    traceparent: traceContext.traceparent ?? DEFAULT_TRACEPARENT,
    tracestate: traceContext.tracestate ?? null,
  };
}
