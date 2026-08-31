import type { NewJob, NewStage, NewTask } from '@map-colonies/jobnik-sdk';
import { faker } from '@faker-js/faker';
import { PRIORITIES } from './constants';

const RANDOM_SUFFIX_LENGTH = 6;

function createJobData(overrides?: Partial<NewJob<string>>): NewJob<string> {
  return {
    name: `${faker.word.noun()}-${Date.now()}-${faker.string.alphanumeric(RANDOM_SUFFIX_LENGTH)}`,
    priority: faker.helpers.arrayElement(PRIORITIES),
    data: faker.airline.airline() as unknown as Record<string, unknown>,
    userMetadata: faker.science.chemicalElement() as unknown as Record<string, unknown>,
    ...overrides,
  };
}

function createStageData(overrides?: Partial<NewStage>): NewStage {
  return {
    type: `${faker.word.noun()}-${Date.now()}-${faker.string.alphanumeric(RANDOM_SUFFIX_LENGTH)}`,
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
