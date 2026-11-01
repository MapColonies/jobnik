import { describe, it, expect } from 'vitest';
import { assertSupportedDbSchema } from '@src/db/drizzle';
import { JOB_MANAGER_SCHEMA } from '@src/db/entities';

describe('drizzle', function () {
  describe('#assertSupportedDbSchema', function () {
    it('should accept the schema the tables are defined in', function () {
      expect(() => assertSupportedDbSchema(JOB_MANAGER_SCHEMA)).not.toThrow();
    });

    it('should reject any other schema', function () {
      expect(() => assertSupportedDbSchema('other_schema')).toThrow(/Unsupported db\.schema 'other_schema'/);
    });
  });
});
