import { describe, it, expect } from 'vitest';
import { getCurrentPercentage, summaryCountsMapper, getInitialXstate } from '@src/stages/models/helper';
import type { StageSummary, StageCreateModel } from '@src/stages/models/models';

describe('helpers', function () {
  const createSummary = (completed: number, total: number): StageSummary => {
    const summary: StageSummary = {
      pending: 0,
      inProgress: 0,
      completed: completed,
      failed: 0,
      created: 0,
      retried: 0,
      total: total,
    };
    return summary;
  };

  describe('#getCurrentPercentage', function () {
    describe('Happy Path', function () {
      it('should return 0% when no tasks are completed', function () {
        const summary = createSummary(0, 100);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(0);
      });

      it('should return 100% when all tasks are completed', function () {
        const summary = createSummary(50, 50);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(100);
      });

      it('should return 50% when half of tasks are completed', function () {
        const summary = createSummary(50, 100);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(50);
      });

      it('should return 25% when a quarter of tasks are completed', function () {
        const summary = createSummary(25, 100);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(25);
      });

      it('should return 75% when three-quarters of tasks are completed', function () {
        const summary = createSummary(75, 100);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(75);
      });

      it('should floor decimal percentages', function () {
        // 33.33% should be floored to 33%
        const summary = createSummary(1, 3);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(33);
      });

      it('should handle large numbers', function () {
        // 33.33% should be floored to 33%
        const LARGE_NUMBER = 1000000;
        const summary = createSummary(LARGE_NUMBER / 4, LARGE_NUMBER);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(25);
      });

      it('should use summaryCountsMapper to access properties', function () {
        // Create a custom summary with direct property access to verify the mapper is used
        const summary = {
          [summaryCountsMapper.COMPLETED]: 75,
          [summaryCountsMapper.TOTAL]: 100,
        } as StageSummary;

        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(75);
      });
    });

    describe('Bad Path', function () {
      it('should handle negative completed counts', function () {
        const summary = createSummary(-10, 100);
        const percentage = getCurrentPercentage(summary);

        // Negative percentages should be handled appropriately
        expect(percentage).toBe(-10);
      });

      it('should handle case where completed count exceeds total', function () {
        const summary = createSummary(150, 100);
        const percentage = getCurrentPercentage(summary);

        // Should be capped at 100% or return the actual value
        expect(percentage).toBe(150);
      });
    });

    describe('Sad Path', function () {
      it('should handle zero total gracefully', function () {
        const summary = createSummary(0, 0);
        const percentage = getCurrentPercentage(summary);

        expect(percentage).toBe(0);
      });
    });
  });

  describe('#getInitialXstate', function () {
    describe('Happy Path', function () {
      it('should return snapshot when called without firstStage parameter (default false)', function () {
        const stagePayload: StageCreateModel = {
          data: {},
          type: 'TEST_STAGE',
        };

        const snapshot = getInitialXstate(stagePayload);

        expect(snapshot).toBeDefined();
        expect(snapshot).toHaveProperty('status');
      });

      it('should return snapshot when firstStage is explicitly false', function () {
        const stagePayload: StageCreateModel = {
          data: {},
          type: 'TEST_STAGE',
        };

        const snapshot = getInitialXstate(stagePayload, false);

        expect(snapshot).toBeDefined();
        expect(snapshot).toHaveProperty('status');
      });

      it('should return snapshot when firstStage is true', function () {
        const stagePayload: StageCreateModel = {
          data: {},
          type: 'TEST_STAGE',
        };

        const snapshot = getInitialXstate(stagePayload, true);

        expect(snapshot).toBeDefined();
        expect(snapshot).toHaveProperty('status');
      });

      it('should return snapshot when startAsWaiting is true', function () {
        const stagePayload: StageCreateModel = {
          data: {},
          type: 'TEST_STAGE',
          startAsWaiting: true,
        };

        const snapshot = getInitialXstate(stagePayload);

        expect(snapshot).toBeDefined();
        expect(snapshot).toHaveProperty('status');
      });

      it('should handle both startAsWaiting and firstStage parameters', function () {
        const stagePayload: StageCreateModel = {
          data: {},
          type: 'TEST_STAGE',
          startAsWaiting: true,
        };

        const snapshot = getInitialXstate(stagePayload, true);

        expect(snapshot).toBeDefined();
        expect(snapshot).toHaveProperty('status');
      });
    });
  });
});
