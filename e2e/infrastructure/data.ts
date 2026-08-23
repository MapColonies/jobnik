import type { NewJob, NewStage, NewTask } from '@map-colonies/jobnik-sdk';
import { faker } from '@faker-js/faker';
import { Priorities } from './constants';

function createJobData(overrides?: Partial<NewJob<string>>): NewJob<string> {
  return {
    name: `${faker.word.noun()}-${Date.now()}-${faker.string.alphanumeric(6)}`,
    priority: faker.helpers.arrayElement(Priorities),
    data: faker.airline.airline() as unknown as Record<string, unknown>,
    userMetadata: faker.science.chemicalElement() as unknown as Record<string, unknown>,
    ...overrides,
  };
}

function createStageData(overrides?: Partial<NewStage<string>>): NewStage<string> {
  return {
    type: `${faker.word.noun()}-${Date.now()}-${faker.string.alphanumeric(6)}`,
    data: faker.airline.airline() as unknown as Record<string, unknown>,
    userMetadata: faker.science.chemicalElement() as unknown as Record<string, unknown>,
    ...overrides,
  };
}

function createTaskData(overrides?: Partial<NewTask>): NewTask {
  return {
    data: faker.airline.airline() as unknown as Record<string, unknown>,
    userMetadata: faker.science.chemicalElement() as unknown as Record<string, unknown>,
    maxAttempts: faker.number.int({ min: 1, max: 5 }),
    ...overrides,
  };
}

export { createJobData, createStageData, createTaskData };
