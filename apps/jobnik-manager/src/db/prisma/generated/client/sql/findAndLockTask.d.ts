import * as $runtime from '../runtime/library';
import { $DbEnums } from './$DbEnums';

/**
 * @param text
 */
export const findAndLockTask: (text: string) => $runtime.TypedSql<findAndLockTask.Parameters, findAndLockTask.Result>;

export namespace findAndLockTask {
  export type Parameters = [text: string];
  export type Result = {
    id: string;
    data: $runtime.JsonValue;
    status: $DbEnums.task_operation_status_enum;
    xstate: $runtime.JsonValue;
    creation_time: Date;
    update_time: Date;
    user_metadata: $runtime.JsonValue;
    stage_id: string;
    attempts: number;
    max_attempts: number;
    traceparent: string;
    tracestate: string | null;
    end_time: Date | null;
    start_time: Date | null;
  };
}
