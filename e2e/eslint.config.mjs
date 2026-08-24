import tsBaseConfig from '@map-colonies/eslint-config/ts-base';
import { defineConfig } from '@map-colonies/eslint-config/helpers';
import vitestConfig from '@map-colonies/eslint-config/vitest';

const customConfig = {
  rules: {
    'no-console': 'error',
  },
};

export default defineConfig(vitestConfig, tsBaseConfig, customConfig, { ignores: ['vitest.config.mts'] });
