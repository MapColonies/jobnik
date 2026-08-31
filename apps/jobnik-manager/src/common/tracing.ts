import { Tracing } from '@map-colonies/tracing';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { IGNORED_INCOMING_TRACE_ROUTES, IGNORED_OUTGOING_TRACE_ROUTES, NODE_VERSION } from './constants';
import { ATTR_MESSAGING_SYSTEM, ATTR_PROCESS_RUNTIME_NAME, ATTR_PROCESS_RUNTIME_VERSION } from './semconv';

let tracing: Tracing | undefined;

export function tracingFactory(options: ConstructorParameters<typeof Tracing>[0]): Tracing {
  tracing = new Tracing({
    ...options,
    instrumentations: [new PrismaInstrumentation()],
    autoInstrumentationsConfigMap: {
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request): boolean =>
          IGNORED_INCOMING_TRACE_ROUTES.some((route) => request.url !== undefined && route.test(request.url)),
        ignoreOutgoingRequestHook: (request): boolean =>
          IGNORED_OUTGOING_TRACE_ROUTES.some((route) => typeof request.path === 'string' && route.test(request.path)),
      },
      '@opentelemetry/instrumentation-fs': {
        requireParentSpan: true,
      },
    },
    attributes: { [ATTR_PROCESS_RUNTIME_NAME]: 'nodejs', [ATTR_PROCESS_RUNTIME_VERSION]: NODE_VERSION, [ATTR_MESSAGING_SYSTEM]: 'jobnik' },
  });

  return tracing;
}

export function getTracing(): Tracing {
  if (!tracing) {
    throw new Error('tracing not initialized');
  }
  return tracing;
}
