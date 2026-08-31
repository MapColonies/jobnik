import type { Logger } from '@map-colonies/js-logger';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { HttpError } from '@map-colonies/error-express-handler';
import type { TypedRequestHandlers } from '@openapi';
import { SERVICES, successMessages } from '@common/constants';
import { IllegalStageStatusTransitionError, JobInFiniteStateError, JobNotFoundError, StageNotFoundError } from '@src/common/generated/errors';
import { StageManager } from '@src/stages/models/manager';
import type { StageFindCriteriaArg } from '@src/stages/models/models';

@injectable()
export class StageControllerV1 {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(StageManager) private readonly manager: StageManager
  ) {}

  public getStages: TypedRequestHandlers['getStagesV1'] = async (req, res, next) => {
    const params: StageFindCriteriaArg = req.query;
    try {
      const response = await this.manager.getStages(params);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      next(err);
    }
  };

  public getStageById: TypedRequestHandlers['getStageByIdV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.getStageById(req.params.stageId, req.query?.should_return_tasks);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      return next(err);
    }
  };

  public getStagesByJobId: TypedRequestHandlers['getStagesByJobIdV1'] = async (req, res, next) => {
    try {
      const includeTasks: boolean | undefined = req.query?.should_return_tasks ?? false;

      const response = await this.manager.getStagesByJobId(req.params.jobId, includeTasks);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }
      next(err);
    }
  };

  public addStage: TypedRequestHandlers['addStageV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.addStage(req.params.jobId, req.body);

      return res.status(httpStatus.CREATED).json(response);
    } catch (err) {
      if (err instanceof JobNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      if (err instanceof JobInFiniteStateError) {
        (err as HttpError).status = httpStatus.BAD_REQUEST;
      }

      return next(err);
    }
  };

  public getSummaryByStageId: TypedRequestHandlers['getStageSummaryV1'] = async (req, res, next) => {
    try {
      const response = await this.manager.getSummaryByStageId(req.params.stageId);
      return res.status(httpStatus.OK).json(response);
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      return next(err);
    }
  };

  public updateUserMetadata: TypedRequestHandlers['updateStageUserMetadataV1'] = async (req, res, next) => {
    try {
      await this.manager.updateUserMetadata(req.params.stageId, req.body);
      return res.status(httpStatus.OK).json({ code: successMessages.stageModifiedSuccessfully });
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      }

      return next(err);
    }
  };

  public updateStatus: TypedRequestHandlers['updateStageStatusV1'] = async (req, res, next) => {
    try {
      await this.manager.updateStatus(req.params.stageId, req.body.status);

      return res.status(httpStatus.OK).json({ code: successMessages.stageModifiedSuccessfully });
    } catch (err) {
      if (err instanceof StageNotFoundError) {
        (err as HttpError).status = httpStatus.NOT_FOUND;
      } else if (err instanceof IllegalStageStatusTransitionError) {
        (err as HttpError).status = httpStatus.BAD_REQUEST;
        this.logger.error({ msg: `Stage status update failed: invalid status transition`, status: req.body.status, err });
      }

      return next(err);
    }
  };
}
