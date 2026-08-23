import type customMatchers from 'jest-extended';

import { APIErrorCode } from '../../src/errors';

interface MyCustomMatchers<R = unknown> {
  toHaveCauseCode: (expectedCode: APIErrorCode) => R;
}

declare module 'vitest' {
  interface Assertion<T = unknown> extends MyCustomMatchers<T>, customMatchers {}
  interface AsymmetricMatchersContaining extends MyCustomMatchers, customMatchers {}
  interface ExpectStatic extends CustomMatchers, MyCustomMatchers {}
}

export {};
