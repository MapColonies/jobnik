import path from 'node:path';
import fs from 'node:fs';
import lodash from 'lodash';

const configPath = path.join(process.cwd(), 'config', 'local-test.json');

export interface Config {
  db?: {
    port?: number;
  };
}

export function getLocalTestConfig(): Config {
  return fs.existsSync(configPath) ? (JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Config) : {};
}

export function updateLocalTestConfig(config: Config, port: number): void {
  const updateConfig = lodash.set(config, 'db.port', port);
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  fs.writeFileSync(configPath, JSON.stringify(updateConfig, null, 2), 'utf-8');
}
