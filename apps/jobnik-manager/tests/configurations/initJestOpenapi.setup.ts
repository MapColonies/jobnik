/* eslint-disable */
import { expect } from 'vitest';
import jestOpenApi from 'jest-openapi';
import { openapiFilePath } from 'jobnik-openapi';

//@ts-ignore
globalThis.expect = expect;

jestOpenApi(openapiFilePath);

//@ts-ignore
globalThis.expect = undefined as any; // Reset global expect to avoid conflicts with other test frameworks
