import { expect } from 'vitest';

expect.extend({
  toHaveCauseCode(received: unknown, expectedCode: string) {
    const { isNot, utils } = this;

    if (!(received instanceof Error)) {
      return {
        pass: false,
        message: (): string => `Expected the received value to be an instance of Error, but it was not.`,
      };
    }

    if (!Object.hasOwn(received, 'cause') || typeof received.cause !== 'object' || received.cause === null) {
      return {
        pass: false,
        message: (): string => `Expected the error to have a 'cause' property of type object.`,
        actual: received,
      };
    }

    const cause = received.cause as { errorCode?: unknown };
    if (!Object.hasOwn(cause, 'errorCode')) {
      return {
        pass: false,
        message: (): string => `Expected the error's cause to have an 'errorCode' property.`,
      };
    }

    const actualCode = cause.errorCode;
    const pass = actualCode === expectedCode;

    return {
      pass,
      message: (): string =>
        `Expected error's cause errorCode ${isNot ? 'not ' : ''}to be ${utils.printExpected(expectedCode)}, but it was ${utils.printReceived(actualCode)}.`,
      actual: actualCode,
      expected: expectedCode,
    };
  },
});
