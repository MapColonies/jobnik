import { Router } from 'express';
import type { FactoryFunction } from 'tsyringe';
import { TaskControllerV1 } from '../tasks/controller';

const taskV1RouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(TaskControllerV1);

  router.get('/', controller.getTasks);
  router.get('/:taskId', controller.getTaskById);
  router.patch('/:taskId/user-metadata', controller.updateUserMetadata);
  router.put('/:taskId/status', controller.updateStatus);
  return router;
};

export { taskV1RouterFactory };
