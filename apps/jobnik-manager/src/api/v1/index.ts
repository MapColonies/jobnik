import { Router } from 'express';
import type { FactoryFunction } from 'tsyringe';
import { ROUTERS } from '@common/constants';

/**
 * V1 API Router Aggregator
 * Aggregates all v1 resource routers under /v1 prefix
 */
export const v1RouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();

  // Resolve v1 routers from DI container with explicit type
  const jobRouter = dependencyContainer.resolve<Router>(ROUTERS.JOBS_V1);
  const stageRouter = dependencyContainer.resolve<Router>(ROUTERS.STAGES_V1);
  const taskRouter = dependencyContainer.resolve<Router>(ROUTERS.TASKS_V1);

  // Mount resource routers
  router.use('/jobs', jobRouter);
  router.use('/stages', stageRouter);
  router.use('/tasks', taskRouter);

  return router;
};

export const V1_ROUTER_SYMBOL = Symbol('v1RouterFactory');
