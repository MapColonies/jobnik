import type { Logger } from '@map-colonies/js-logger';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { HttpError } from '@map-colonies/error-express-handler';
import type { TypedRequestHandlers } from '@openapi';
import { SERVICES, successMessages } from '@common/constants';
import {
  IllegalJobStatusTransitionError,
  IllegalStageStatusTransitionError,
  IllegalTaskStatusTransitionError,
  JobNotFoundError,
  NotAllowedToAddTasksToInProgressStageError,
  StageInFiniteStateError,
  StageNotFoundError,
  TaskStatusUpdateFailedError,
  TaskNotFoundError,
} from '@src/common/generated/errors';
import { TaskManager } from '@src/tasks/models/manager';
import { type TasksFindCriteriaArg } from '@src/tasks/models/models';

const badRequestErrors = [
  TaskStatusUpdateFailedError,
  IllegalTaskStatusTransitionError,
  IllegalStageStatusTransitionError,
  IllegalJobStatusTransitionError,
  JobNotFoundError,
  StageNotFoundError,
];

const internalErrors = [
  TaskStatusUpdateFailedError,
  IllegalTaskStatusTransitionError,
  IllegalStageStatusTransitionError,
  IllegalJobStatusTransitionError,
  JobNotFoundError,
  StageNotFoundError,
];

@injectable()
export class TaskControllerV1 {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(TaskManager) private readonly manager: TaskManager
  ) {}

  public addTasks: TypedRequestHandlers['addTasksV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.addTasks(req.params.stageId, req.body);

      return res.status(httpStatus.CREATED).json(response);
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      if (err instanceof NotAllowedToAddTasksToInProgressStageError || err instanceof StageInFiniteStateError) {
        (err as HttpError).status = httpStatus.BAD_REQUEST;
      }

      return next(err);
    }
  };

  public getTasks: TypedRequestHandlers['getTasksByCriteriaV1'] = async (req, res, next) => {
    const params: TasksFindCriteriaArg = req.query;
    try {
      const response = await this.manager.getTasks(params);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      next(err);
    }
  };

  public getTaskById: TypedRequestHandlers['getTaskByIdV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.getTaskById(req.params.taskId);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      return next(err);
    }
  };

  public getTaskByStageId: TypedRequestHandlers['getTasksByStageIdV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.getTasksByStageId(req.params.stageId, req.query);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }
      next(err);
    }
  };

  public updateUserMetadata: TypedRequestHandlers['updateTaskUserMetadataV1'] = async (req, res, next) => {
    try {
      await this.manager.updateUserMetadata(req.params.taskId, req.body);
      return res.status(httpStatus.OK).json({ code: successMessages.taskModifiedSuccessfully });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      return next(err);
    }
  };

  public updateStatus: TypedRequestHandlers['updateTaskStatusV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.updateStatus(req.params.taskId, req.body.status);

      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      } else if (err instanceof TaskStatusUpdateFailedError) {
        // Race condition: resource was modified by another request
        (err as HttpError).status = httpStatus.CONFLICT;
      } else if (badRequestErrors.some((e) => err instanceof e)) {
        (err as HttpError).status = httpStatus.BAD_REQUEST;
      }

      return next(err);
    }
  };

  public dequeue: TypedRequestHandlers['dequeueTaskV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.dequeue(req.params.stageType);

      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      } else if (err instanceof TaskStatusUpdateFailedError) {
        // Race condition: another worker already dequeued this task
        (err as HttpError).status = httpStatus.CONFLICT;
      } else if (internalErrors.some((e) => err instanceof e)) {
        (err as HttpError).status = httpStatus.INTERNAL_SERVER_ERROR;
      }

      return next(err);
    }
  };
}
