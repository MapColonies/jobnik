/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Logger } from './logger';

export class NoopLogger implements Logger {
  public debug(obj: object | string, ...args: any[]): void {
    // No-op
  }

  public info(obj: object | string, ...args: any[]): void {
    // No-op
  }

  public warn(obj: object | string, ...args: any[]): void {
    // No-op
  }

  public error(obj: object | string, ...args: any[]): void {
    // No-op
  }
}
