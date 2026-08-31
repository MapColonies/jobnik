import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from 'prom-client';
import { JobnikSDK } from '../../src/sdk';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import type { HttpClientOptions } from '../../src/network/httpClient';

// Test types for testing generic type functionality
interface TestJobTypes {
  'image-processing': {
    userMetadata: { userId: string; priority: number };
    data: { imageUrl: string; format: string };
  };
  'data-export': {
    userMetadata: { department: string };
    data: { query: string; format: 'csv' | 'json' };
  };
}

interface TestStageTypes {
  'image-resize': {
    userMetadata: { quality: number };
    data: { width: number; height: number };
    task: {
      userMetadata: { batchId: string };
      data: { sourceUrl: string; targetUrl: string };
    };
  };
  'data-transform': {
    userMetadata: { transformerId: string };
    data: { inputFormat: string; outputFormat: string };
    task: {
      userMetadata: { rowId: string };
      data: { inputData: Record<string, unknown>; transformRules: string[] };
    };
  };
}

describe('JobnikSDK', () => {
  const baseUrl = 'http://localhost:8080';
  let metricsRegistry: Registry;

  beforeEach(() => {
    metricsRegistry = new Registry();
  });

  describe('construction', () => {
    it('should create SDK instance with required options', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      expect(sdk).toBeInstanceOf(JobnikSDK);
    });

    it('should create SDK instance with all options', () => {
      const logger = new NoopLogger();
      const httpClientOptions: HttpClientOptions = {
        retry: { maxRetries: 3 },
        agentOptions: { keepAliveTimeout: 10000 },
      };

      const sdk = new JobnikSDK({
        baseUrl,
        logger,
        httpClientOptions,
        metricsRegistry,
      });

      expect(sdk).toBeInstanceOf(JobnikSDK);
    });

    it('should create SDK instance with custom types', () => {
      const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
        baseUrl,
        metricsRegistry,
      });

      expect(sdk).toBeInstanceOf(JobnikSDK);
    });
  });

  describe('getConsumer', () => {
    it('should return a Consumer instance', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const consumer = sdk.getConsumer();

      expect(consumer).toBeDefined();
      // Check it has expected methods
      expect(consumer.dequeueTask).toBeFunction();
      expect(consumer.markTaskCompleted).toBeFunction();
      expect(consumer.markTaskFailed).toBeFunction();
    });

    it('should return Consumer with correct type signature for typed SDK', () => {
      const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
        baseUrl,
        metricsRegistry,
      });

      const consumer = sdk.getConsumer();

      expect(consumer).toBeDefined();
      expect(consumer.dequeueTask).toBeFunction();
    });
  });

  describe('getProducer', () => {
    it('should return a Producer instance', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const producer = sdk.getProducer();

      expect(producer).toBeDefined();
      // Check it has expected methods
      expect(producer.createJob).toBeFunction();
      expect(producer.createStage).toBeFunction();
      expect(producer.createTasks).toBeFunction();
    });

    it('should return Producer with correct type signature for typed SDK', () => {
      const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
        baseUrl,
        metricsRegistry,
      });

      const producer = sdk.getProducer();

      expect(producer).toBeDefined();
      expect(producer.createJob).toBeFunction();
    });
  });

  describe('createWorker', () => {
    it('should return a Worker instance', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const taskHandler = async () => {
        // Mock task handler
      };

      const worker = sdk.createWorker('test-stage', taskHandler);

      expect(worker).toBeDefined();
      // Check it has expected methods
      expect(worker.start).toBeFunction();
      expect(worker.stop).toBeFunction();
    });

    it('should return Worker with options', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const taskHandler = async () => {
        // Mock task handler
      };

      const worker = sdk.createWorker('test-stage', taskHandler, {
        concurrency: 5,
        backoffOptions: {
          initialBaseRetryDelayMs: 2000,
          backoffFactor: 2,
          maxDelayMs: 30000,
        },
      });

      expect(worker).toBeDefined();
      expect(worker.start).toBeFunction();
    });

    it('should return Worker for typed SDK', () => {
      const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
        baseUrl,
        metricsRegistry,
      });

      const taskHandler = async () => {
        // Mock task handler for image-resize
      };

      const worker = sdk.createWorker('image-resize', taskHandler);

      expect(worker).toBeDefined();
      expect(worker.start).toBeFunction();
    });
  });

  describe('integration', () => {
    it('should provide consistent instances across multiple calls', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const consumer1 = sdk.getConsumer();
      const consumer2 = sdk.getConsumer();
      const producer1 = sdk.getProducer();
      const producer2 = sdk.getProducer();

      // Should return the same instances (they're created once in constructor)
      expect(consumer1).toBe(consumer2);
      expect(producer1).toBe(producer2);
    });

    it('should allow creating multiple workers', () => {
      const sdk = new JobnikSDK({
        baseUrl,
        metricsRegistry,
      });

      const taskHandler1 = async () => {};
      const taskHandler2 = async () => {};

      const worker1 = sdk.createWorker('stage-1', taskHandler1);
      const worker2 = sdk.createWorker('stage-2', taskHandler2);

      expect(worker1).toBeDefined();
      expect(worker2).toBeDefined();
      expect(worker1).not.toBe(worker2);
    });
  });
});
