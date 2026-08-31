/* eslint-disable @typescript-eslint/naming-convention */
import { setup } from 'xstate';
import { JobOperationStatus } from '@prismaClient';

type ChangeStatusOperations = 'pend' | 'pause' | 'abort' | 'complete' | 'process' | 'fail' | 'create';

const OperationStatusMapper: { [key in JobOperationStatus]: ChangeStatusOperations } = {
  [JobOperationStatus.PENDING]: 'pend',
  [JobOperationStatus.IN_PROGRESS]: 'process',
  [JobOperationStatus.COMPLETED]: 'complete',
  [JobOperationStatus.FAILED]: 'fail',
  [JobOperationStatus.ABORTED]: 'abort',
  [JobOperationStatus.CREATED]: 'create',
  [JobOperationStatus.PAUSED]: 'pause',
};

const jobStateMachine = setup({
  types: {
    events: {} as
      { type: 'pend' } | { type: 'pause' } | { type: 'abort' } | { type: 'complete' } | { type: 'process' } | { type: 'fail' } | { type: 'create' },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QCsD2AjAygFwIbYFdYA6AYQCUBRAQQBVKARAYgAcwA7CAbQAYBdRKBapYAS2yjU7QSAAeiAIwBOAOzEAzEp4A2AEwAOfdu371AFhXaANCACei9QuJKXSo+u1KArDwUqAvv42aFh4hCQUNPTMAO644rwCSCDCYhJSMvIIymqaOgZGJuaWNvYI+k5mrkpVuir6XkqBwRg4+ERkVHSMrLhEYIkyqeKS0slZORpaeobGphbWdoh6PM4KxuoeKiqqSrrNICFt4Z1RPbjoqABO2IPJw+ljoBOqU-mzRQulitqOzi6mfQ8fTbBRedQHI5hDoABUoADkGABJeEAcSYcQS-CGIhGGXGDkaxAUIK8YP0Sl+2i8Xm+CDMYOIeiqKgUml06ksZkhrWhJDhiJR6JYV1QAGM4LA7kJcY9MooeEonLpKRSeMCuWYzHT6tpiLoqt5tAyvLoyQoeaF2vyEci0UwLtdbtj7rLRvLsuoiSSVGSvBSqTS6QpdJ5iCoqg1FWazRagodedbiAK7cK+rABi6ZWl3QTsgoeF5iGZ9Fr1QYtb66THw4b9LpFTx1ByeNz41CkyiAPow8gAeVRVEwmCYYtQAFsWAAbMDYTNJbN4p5yRDbfT66naEmcrT1ulbsz-FyeGP1VmW44dbu9gdDkcAM3iU+lKTd+Oeq-qG68W9MO2Buh0loagRi4PA7FUZgqtoF58sQ179oOlDDg6lw3C+Dy5h+CBrt+v47gBwZ5MWAJmMYZHgbo+ztomJwIbeyEjiw6bzjiObviu9LGsQ4IhrUhabC4+66E46hAns6pNl4ljUS0Vp0fCPaIXeGLxM6C6vuxy5ZLhoY-tu-57ks2Q8AY+qRo0JYeMCbZyZe-LUAAqpgPRsJwGFvtpiBmD4GhmJyeTAj4NTqHSAUkS4a4KNFWq2Qm8mwk5LmxGpHlaR6PmrOYAVaEFir+cGCglkeDSmq2UGqLBSYwklrmihKsBSlmmlLhlvnZSogVRiF+6ssQhiKjFPkiRSVUnDVznnGh6lsa1eaZX5OXqt1BXGWC0XmW4UEeCYSicmNHQAOrUEitBCqwHDcM1mEcRM1n9f5vpuEqMbasZHhFnxuzeOBmwBDRCUkMdp3nY66HXZ5HrkmoDR7UqYJkr6b1lAy65fay7KcsagTxuwqAQHAMgduEs1ynmAC0ixlJTxCSeqqr+TtW4HREXTRKTWGcVBQGHqYmxmmYNk6NJLPJraQoc7dihUU4pZYwYXq-E2YWdUeqj1NFRVaqL9FIcOkteQg0mrGqW5+D+VSmsJSjOMasZKoW6wwQD9nJrVDAGx66iKs4nJVJu3g5MJlRO5s2jbLssnxa7wNnWint5kVYYmL6BZFMaIJ0qjTIGqobJ7Fj2su3BpB9gAsjCAAylDs666V5sBxJmuqOwqL4WN0j4ThO782xt5YfiiwAYid1ce3Xc3YY3IY+OBqjtyUxnTGrppstolFxcTHTUAAQn25C14uZPYesbgaI0YmWQa-pUw4FK1s9wLNqyJY4-4QA */
  id: 'jobStatus',
  initial: 'CREATED',
  states: {
    CREATED: {
      on: {
        pend: { target: 'PENDING' },
        pause: { target: 'PAUSED' },
        abort: { target: 'ABORTED' },
      },
    },
    PENDING: {
      on: {
        process: { target: 'IN_PROGRESS' },
        abort: { target: 'ABORTED' },
        pause: { target: 'PAUSED' },
      },
    },
    IN_PROGRESS: {
      on: {
        complete: { target: 'COMPLETED' },
        fail: { target: 'FAILED' },
        abort: { target: 'ABORTED' },
        pause: { target: 'PAUSED' },
      },
    },
    PAUSED: {
      on: {
        pend: { target: 'PENDING' },
        process: { target: 'IN_PROGRESS' },
        abort: { target: 'ABORTED' },
      },
    },
    COMPLETED: {
      type: 'final',
    },
    FAILED: {
      type: 'final',
    },
    ABORTED: {
      type: 'final',
    },
  },
});

export { jobStateMachine, OperationStatusMapper };
