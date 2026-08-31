import { vi, type Mock } from 'vitest';

/**
 * Creates a mock for a proxy object's method for Vitest 4.0+.
 *
 * Vitest 4.0 changed how vi.spyOn works - it now validates that the method
 * is an own property descriptor. Proxy objects (like Prisma Client) don't have
 * own property descriptors for their methods - they're accessed through Proxy get traps.
 *
 * This function works around the limitation by:
 * 1. Validating the original method exists and is a function
 * 2. Replacing it with a vi.fn() mock that can be controlled in tests
 * 3. Returning the mock function for assertions
 *
 * Note: This completely replaces the method with a mock, it does not spy on the original.
 *
 * @param target - The proxy object (e.g., prisma.job)
 * @param method - The method name (e.g., 'findMany')
 * @returns A vi.fn() mock that replaces the original method
 *
 * @example
 * ```ts
 * const findManyMock = createProxyMock(prisma.job, 'findMany');
 * findManyMock.mockRejectedValueOnce(new Error('DB error'));
 * ```
 */
export const createProxyMock = <T extends object, K extends keyof T>(target: T, method: K): Mock => {
  const original = target[method];

  if (typeof original !== 'function') {
    throw new TypeError(`Cannot spy on '${String(method)}': property is not a function`);
  }

  const mockFn = vi.fn();

  Object.defineProperty(target, method, {
    value: mockFn,
    writable: true,
    configurable: true,
  });

  return mockFn;
};
