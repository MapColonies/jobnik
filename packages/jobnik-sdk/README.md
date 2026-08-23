# Jobnik SDK

TypeScript SDK for interacting with the Jobnik job management system. Provides type-safe clients for creating jobs, processing tasks, and monitoring workflows with built-in observability and resilience patterns.

## Features

- **Type-Safe API**: Full TypeScript support with custom job and stage type definitions
- **Producer Client**: Create and manage jobs, stages, and tasks
- **Worker Client**: Automated task processing with configurable concurrency
- **Circuit Breaker Protection**: Built-in resilience for handling failures
- **Observability**: Prometheus metrics and OpenTelemetry distributed tracing
- **Graceful Shutdown**: Coordinated shutdown with running task completion

## Installation

```bash
npm install @map-colonies/jobnik-sdk
```

**Requirements**: Node.js >= 24

## Quick Start

### Initialize the SDK

```typescript
import { JobnikSDK } from '@map-colonies/jobnik-sdk';

const sdk = new JobnikSDK({
  baseUrl: 'https://api.jobnik.example.com',
  metricsRegistry: new Registry(),
});
```

### Define Custom Types (Optional)

```typescript
interface MyJobTypes {
  'image-processing': {
    userMetadata: { userId: string };
    data: { imageUrl: string };
  };
}

interface MyStageTypes {
  resize: {
    userMetadata: { quality: number };
    data: { width: number; height: number };
    task: {
      userMetadata: { batchId: string };
      data: { sourceUrl: string; targetPath: string };
    };
  };
}

const sdk = new JobnikSDK<MyJobTypes, MyStageTypes>({
  baseUrl: 'https://api.jobnik.example.com',
  metricsRegistry: new Registry(),
});
```

### Create Jobs (Producer)

```typescript
const producer = sdk.getProducer();

// Create a job
const job = await producer.createJob({
  name: 'image-processing',
  data: { imageUrl: 'https://example.com/image.jpg' },
  userMetadata: { userId: 'user-123' },
  priority: 'HIGH',
});

// Add a stage to the job
const stage = await producer.createStage(job.id, {
  type: 'resize',
  data: { width: 800, height: 600 },
  userMetadata: { quality: 90 },
});

// Add tasks to the stage
const task = await producer.createTasks(stage.id, stage.type, [
  {
    data: { sourceUrl: 'https://example.com/image.jpg', targetPath: '/output/resized.jpg' },
    userMetadata: { batchId: 'batch-1' },
  },
]);
```

### Process Tasks (Worker)

```typescript
// Define task handler
const taskHandler = async (task, context) => {
  const { sourceUrl, targetPath } = task.data;

  context.logger.info('Processing task', { taskId: task.id });

  // Your processing logic here
  await resizeImage(sourceUrl, targetPath);

  // Check for cancellation during shutdown
  if (context.signal.aborted) {
    throw new Error('Task cancelled');
  }
};

// Create and start worker using the SDK
const worker = sdk.createWorker('resize', taskHandler, {
  concurrency: 5,
  backoffOptions: {
    initialBaseRetryDelayMs: 1000,
    maxDelayMs: 60000,
    backoffFactor: 2,
  },
});

await worker.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.stop();
});
```

## Observability

### Prometheus Metrics

```typescript
import { Registry } from 'prom-client';

const registry = new Registry();
const sdk = new JobnikSDK({
  baseUrl: 'https://api.jobnik.example.com',
  metricsRegistry: registry,
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

### OpenTelemetry Tracing

The SDK automatically creates spans for all operations when OpenTelemetry is configured in your application. Trace context is propagated through jobs, stages, and tasks.

## Configuration Options

```typescript
const sdk = new JobnikSDK({
  baseUrl: string;                    // Required: Jobnik API base URL
  httpClientOptions?: {               // Optional: HTTP client configuration
    retry?: {                         // Retry configuration
      maxRetries?: number;            // Maximum number of retries
      statusCodes?: number[];         // HTTP status codes to retry
      errorCodes?: string[];          // Error codes to retry
      initialBaseRetryDelayMs?: number; // Initial base delay in ms
      disableJitter?: boolean;        // Disable random jitter in delay
      maxJitterFactor?: number;       // Maximum jitter factor
    };
    agentOptions?: Agent.Options;     // HTTP agent options
  };
  logger?: Logger;                    // Optional: Custom logger (defaults to NoopLogger)
  metricsRegistry: Registry;          // Required: Prometheus registry for metrics
});
```

## Documentation

Full API documentation is available at [https://mapcolonies.github.io/jobnik-sdk/](https://mapcolonies.github.io/jobnik-sdk/)

## License

ISC
