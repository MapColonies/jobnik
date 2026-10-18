import { defineRelations } from 'drizzle-orm';
import { jobTable } from './job';
import { stageTable } from './stage';
import { taskTable } from './task';

export const relations = defineRelations({ job: jobTable, stage: stageTable, task: taskTable }, (r) => ({
  job: {
    stages: r.many.stage(),
  },
  stage: {
    job: r.one.job({ from: r.stage.jobId, to: r.job.id, optional: false }),
    tasks: r.many.task(),
  },
  task: {
    stage: r.one.stage({ from: r.task.stageId, to: r.stage.id, optional: false }),
  },
}));

export * from './common';
export * from './job';
export * from './stage';
export * from './task';
