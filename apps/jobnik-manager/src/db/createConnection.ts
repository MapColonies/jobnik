import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import type { commonDbFullV1Type } from '@map-colonies/schemas';
import type { PoolConfig } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { TX_TIMEOUT_MS } from '@src/common/constants';
import { PrismaClient } from '../db/prisma/generated/client';

interface SchemaExistsResult {
  exists: boolean;
}

export type DbConfig = PoolConfig & commonDbFullV1Type;

export const createConnectionOptions = (dbConfig: DbConfig): PoolConfig => {
  const { ssl, ...dataSourceOptions } = dbConfig;
  dataSourceOptions.application_name = `${hostname()}-${process.env.NODE_ENV ?? 'unknown_env'}`;

  const poolConfig: PoolConfig = {
    ...dataSourceOptions,
    user: dbConfig.username,
  };
  if (ssl.enabled) {
    delete poolConfig.password;
    try {
      poolConfig.ssl = {
        key: readFileSync(ssl.key),
        cert: readFileSync(ssl.cert),
        ca: readFileSync(ssl.ca),
      };
    } catch (error) {
      throw new Error(`Failed to load SSL certificates. Ensure the files exist and are accessible. Details: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  return poolConfig;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPrismaClient(poolConfig: PoolConfig, schema: string) {
  const adapter = new PrismaPg(poolConfig, { schema });
  const prisma = new PrismaClient({
    adapter,
    transactionOptions: {
      timeout: TX_TIMEOUT_MS,
    },
  }).$extends({
    query: {
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      $allOperations({ args, query }) {
        /* your custom logic for modifying all Prisma Client operations here */
        return query(args).catch((error) => {
          (error as { isPrismaError: boolean }).isPrismaError = true; // mark the error as a Prisma error
          throw error;
        });
      },
    },
  });
  return prisma;
}

export async function verifyDbSetup(prisma: PrismaClient, schema: string): Promise<void> {
  try {
    const checkSchemaExists = await prisma.$queryRaw<SchemaExistsResult[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = ${schema}
    )
  `;
    if (!(checkSchemaExists[0]?.exists ?? false)) {
      throw new Error(`Schema: ${schema} doesn't exists`);
    }

    await prisma.job.count(); // validate migration deployed job table
    await prisma.stage.count(); // validate migration deployed stage table
    await prisma.task.count(); // validate migration deployed task table
  } catch (error) {
    throw new Error(`Error on db connection: ${(error as Error).message}`, { cause: error });
  }
}
