import path from 'node:path';
import type { commonDbFullV1Type } from '@map-colonies/schemas';

/**
 * Extract and build DB connection url based on configuration
 * @param dbConfig DB config object 'commonDbFullV1Type'
 * @returns string represent connection url according: https://www.prisma.io/docs/orm/overview/databases/postgresql#3-instantiate-prisma-client-using-the-driver-adapter
 */
function createDbConnectUrl(dbConfig: commonDbFullV1Type): string {
  const { username, password, host, database, port, schema, ssl } = dbConfig;

  let connectionUrl = `postgresql://${username}:${password}@${host}:${port}/${database}?schema=${schema}`;

  if (ssl.enabled) {
    // todo - calculate and implement cert generation and replacement
    const rootCaFileName = path.basename(ssl.ca);
    connectionUrl = `${connectionUrl}&sslidentity=client-identity.p12&sslcert=${rootCaFileName}`;
  }

  return connectionUrl;
}

export { createDbConnectUrl };
