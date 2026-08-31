import { defineConfig, ViteUserConfig } from 'vitest/config';

const reporters: Exclude<ViteUserConfig['test'], undefined>['reporters'] = ['default', 'html'];

if (process.env.GITHUB_ACTIONS) {
  reporters.push('github-actions');
}

export default defineConfig({
  test: {
    include: ['tests/*.spec.ts'],
    environment: 'node',
    globalSetup: ['./infrastructure/globalSetup.ts'],

    reporters,
  },
});
