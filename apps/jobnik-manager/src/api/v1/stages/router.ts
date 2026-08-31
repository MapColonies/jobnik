import { Router } from 'express';
import type { FactoryFunction } from 'tsyringe';
import { TaskControllerV1 } from '../tasks/controller';
import { StageControllerV1 } from './controller';

const stageV1RouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(StageControllerV1);
  const taskController = dependencyContainer.resolve(TaskControllerV1);

  // Stage routes
  router.get('/', controller.getStages);
  router.get('/:stageId', controller.getStageById);
  router.get('/:stageId/summary', controller.getSummaryByStageId);
  router.patch('/:stageId/user-metadata', controller.updateUserMetadata);
  router.put('/:stageId/status', controller.updateStatus);

  // Nested task routes under stage
  router.get('/:stageId/tasks', taskController.getTaskByStageId);
  router.post('/:stageId/tasks', taskController.addTasks);
  router.patch('/:stageType/tasks/dequeue', taskController.dequeue);

  return router;
};

export { stageV1RouterFactory };
