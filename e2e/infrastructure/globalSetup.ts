import path from 'node:path';
import { upAll, downAll } from 'docker-compose';
import isCI from 'is-ci';

const composeOptions = { cwd: path.join(__dirname, '..'), log: true };

export async function setup(): Promise<void> {
  // Always rebuild: the suite must run against an image built from the current checkout,
  // never a stale one left over from a previous invocation.
  await upAll({ ...composeOptions, commandOptions: ['--build', '--wait'] });
}

export async function teardown(): Promise<void> {
  if (isCI) {
    await downAll({ ...composeOptions, commandOptions: ['-v'] });
  }
}
