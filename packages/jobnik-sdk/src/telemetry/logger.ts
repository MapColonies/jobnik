/**
 * @inline
 */
export interface LogFn {
  (obj: object, ...args: unknown[]): void;
  (obj: object, msg: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}
