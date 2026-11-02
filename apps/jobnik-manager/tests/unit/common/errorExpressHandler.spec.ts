import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DrizzleQueryError } from 'drizzle-orm';
import { getErrorHandlerMiddleware } from '@src/common/utils/error-express-handler';
import { DatabaseConnectionError } from '@src/db/drizzle';

interface ErrorResponseBody {
  code: string;
  message: string;
}

function handleError(err: Error): { status: number; body: ErrorResponseBody } {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);

  getErrorHandlerMiddleware()(err, { passedValidation: true } as Request, res as unknown as Response, vi.fn() as NextFunction);

  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] as ErrorResponseBody };
}

describe('errorExpressHandler', function () {
  describe('#getErrorHandlerMiddleware', function () {
    it('should respond with UNKNOWN_ERROR and 500 for a plain error', function () {
      const { status, body } = handleError(new Error('boom'));

      expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(body).toMatchObject({ code: 'UNKNOWN_ERROR', message: 'boom' });
    });

    it('should respond with DATABASE_RELATED_ERROR for a DrizzleQueryError', function () {
      const { status, body } = handleError(new DrizzleQueryError('SELECT 1', [], new Error('connection terminated')));

      expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(body).toHaveProperty('code', 'DATABASE_RELATED_ERROR');
    });

    it('should respond with DATABASE_RELATED_ERROR for a DatabaseConnectionError', function () {
      const { status, body } = handleError(new DatabaseConnectionError('Failed to start a transaction'));

      expect(status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(body).toHaveProperty('code', 'DATABASE_RELATED_ERROR');
    });
  });
});
