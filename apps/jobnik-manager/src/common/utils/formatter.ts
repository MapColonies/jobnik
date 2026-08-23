import { camelCase } from 'lodash';
import type { CamelCase } from 'type-fest';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

function screamingToCamelCase<T extends string>(str: T): CamelCase<T> {
  return camelCase(str) as CamelCase<T>;
}

type CamelCaseMapper<T extends Record<string, string>> = Prettify<{
  [K in keyof T]: CamelCase<T[K]>;
}>;

function createCamelCaseMapper<T extends Record<string, string>>(obj: T): CamelCaseMapper<T> {
  // If the actual type given here, it will lead to stack overflow
  const result = {} as Record<keyof T, string>;

  // Iterate through each key in the object and convert its value to camel case
  for (const key in obj) {
    const value = obj[key];
    /* v8 ignore next 3 -- @preserve */
    if (typeof value === 'string') {
      result[key] = screamingToCamelCase(value);
    }
  }

  return result as CamelCaseMapper<T>;
}

export { createCamelCaseMapper };
