/**
 * Awaits a promise and returns a tuple of [error, result].
 * If the promise resolves, the result is the second element and the error is undefined.
 * If the promise rejects, the error is the first element and the result is undefined.
 *
 * @param promise The promise to await.
 * @returns A promise that resolves to a tuple: [Error, undefined] | [undefined, T]
 */
export async function presult<T>(promise: Promise<T>): Promise<[Error, undefined] | [undefined, T]> {
  try {
    const value = await promise;
    return [undefined, value];
  } catch (err) {
    if (err instanceof Error) {
      return [err, undefined];
    }
    return [new Error(String(err)), undefined];
  }
}

export function getErrorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
