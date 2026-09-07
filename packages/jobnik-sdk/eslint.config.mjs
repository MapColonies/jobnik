import tsBaseConfig, { namingConventions } from '@map-colonies/eslint-config/ts-base';
import { defineConfig } from '@map-colonies/eslint-config/helpers';

const SemanticConventionsExtension = {
  selector: ['objectLiteralProperty', 'typeProperty'],
  format: null,
  filter: {
    match: true,
    regex: '^(_|stage_type)$',
  },
};

// Create a new array with the base rules and our custom rule
const namingConvention = [...namingConventions, SemanticConventionsExtension];

const customConfig = {
  rules: {
    '@typescript-eslint/naming-convention': namingConvention,
    'no-console': 'error',
  },
};

export default defineConfig(tsBaseConfig, customConfig, { ignores: ['vitest.config.mts'] });
