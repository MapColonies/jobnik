import { type ConfigInstance, config } from '@map-colonies/config';
import { infraJobnikManagerV1, type infraJobnikManagerV1Type } from '@map-colonies/schemas';

// Choose here the type of the config instance and import this type from the entire application
type ConfigType = ConfigInstance<infraJobnikManagerV1Type>;

let configInstance: ConfigType | undefined;

/**
 * Initializes the configuration by fetching it from the server.
 * This should only be called from the instrumentation file.
 * @returns A Promise that resolves when the configuration is successfully initialized.
 */
async function initConfig(offlineMode?: boolean): Promise<void> {
  configInstance = await config({
    schema: infraJobnikManagerV1,
    offlineMode: offlineMode,
  });
}

function getConfig(): ConfigType {
  /* v8 ignore next 3 -- @preserve */
  if (!configInstance) {
    throw new Error('config not initialized');
  }
  return configInstance;
}

export { getConfig, initConfig };
export type { ConfigType };
