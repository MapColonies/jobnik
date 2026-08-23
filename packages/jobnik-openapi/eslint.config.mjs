import tsBaseConfig from '@map-colonies/eslint-config/ts-base';
import { defineConfig } from '@map-colonies/eslint-config/helpers';

const customConfig = {
  rules: {
    'no-console': 'error',
  },
};

export default defineConfig(tsBaseConfig, customConfig, { ignores: ['src/openapi.d.ts'] });
