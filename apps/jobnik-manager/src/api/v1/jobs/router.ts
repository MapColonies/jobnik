import { Router } from 'express';
import type { FactoryFunction } from 'tsyringe';
import { StageControllerV1 } from '../stages/controller';
import { JobControllerV1 } from './controller';

const jobV1RouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(JobControllerV1);
  const stageController = dependencyContainer.resolve(StageControllerV1);

  // Job routes
  router.get('/', controller.getJobs);
  router.post('/', controller.createJob);
  router.get('/:jobId', controller.getJobById);
  router.delete('/:jobId', controller.deleteJob);
  router.patch('/:jobId/user-metadata', controller.updateUserMetadata);
  router.patch('/:jobId/priority', controller.updateJobPriority);
  router.put('/:jobId/status', controller.updateStatus);

  // Nested stage routes under job
  router.get('/:jobId/stages', stageController.getStagesByJobId);
  router.post('/:jobId/stage', stageController.addStage);
  return router;
};

export { jobV1RouterFactory };
