import express, { json, type Router } from 'express';
import compression from 'compression';
import { OpenapiViewerRouter } from '@map-colonies/openapi-express-viewer';
import { middleware as OpenApiMiddleware } from 'express-openapi-validator';
import { inject, injectable } from 'tsyringe';
import type { Logger } from '@map-colonies/js-logger';
import { httpLogger } from '@map-colonies/express-access-log-middleware';
import { getTraceContexHeaderMiddleware } from '@map-colonies/tracing-utils';
import { collectMetricsExpressMiddleware } from '@map-colonies/prometheus';
import { Registry } from 'prom-client';
import { getErrorHandlerMiddleware } from '@common/utils/error-express-handler';
import type { ConfigType } from '@common/config';
import { SERVICES } from '@common/constants';
import { V1_ROUTER_SYMBOL } from './api/v1';

declare module 'express-serve-static-core' {
  interface Request {
    passedValidation?: boolean;
  }
}

@injectable()
export class ServerBuilder {
  private readonly serverInstance: express.Application;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.SERVICE_METRICS) private readonly serviceMetricsRegistry: Registry,
    @inject(SERVICES.METRICS) private readonly metricsRegistry: Registry,
    @inject(V1_ROUTER_SYMBOL) private readonly v1Router: Router
  ) {
    this.serverInstance = express();
  }

  public build(): express.Application {
    this.registerPreRoutesMiddleware();
    this.buildRoutes();
    this.registerPostRoutesMiddleware();

    return this.serverInstance;
  }

  private buildDocsRoutes(): void {
    const openapiRouter = new OpenapiViewerRouter({
      ...this.config.get('openapiConfig'),
      filePathOrSpec: this.config.get('openapiConfig.filePath'),
    });
    openapiRouter.setup();
    this.serverInstance.use(this.config.get('openapiConfig.basePath'), openapiRouter.getRouter());
  }

  private buildRoutes(): void {
    this.serverInstance.use('/v1', this.v1Router);

    this.buildDocsRoutes();
  }

  private registerPreRoutesMiddleware(): void {
    this.serverInstance.use(collectMetricsExpressMiddleware({ registry: this.metricsRegistry, includeOperationId: true }));
    this.serverInstance.use(httpLogger({ logger: this.logger, ignorePaths: ['/metrics', '/service-metrics'] }));

    // Add service-level metrics endpoint
    /* v8 ignore next 12 -- @preserve */
    this.serverInstance.use('/service-metrics', (req, res, next) => {
      const registry = this.serviceMetricsRegistry;
      registry
        .metrics()
        .then((metrics) => {
          res.set('Content-Type', registry.contentType);
          res.end(metrics);
        })
        .catch((error) => {
          next(error);
        });
    });

    /* v8 ignore next 3 -- @preserve */
    if (this.config.get('server.response.compression.enabled')) {
      this.serverInstance.use(compression(this.config.get('server.response.compression.options') as unknown as compression.CompressionFilter));
    }

    this.serverInstance.use(json(this.config.get('server.request.payload')));
    this.serverInstance.use(getTraceContexHeaderMiddleware());

    const ignorePathRegex = new RegExp(`^${this.config.get('openapiConfig.basePath')}/.*`, 'i');
    const apiSpecPath = this.config.get('openapiConfig.filePath');
    this.serverInstance.use(
      OpenApiMiddleware({ apiSpec: apiSpecPath, validateSecurity: false, validateRequests: true, ignorePaths: ignorePathRegex })
    );
    this.serverInstance.use((req, res, next) => {
      req.passedValidation = true;
      next();
    });
  }

  private registerPostRoutesMiddleware(): void {
    this.serverInstance.use(getErrorHandlerMiddleware());
  }
}
