import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

const commit = process.env.GITHUB_SHA;
const shortCommit = commit && /^[a-f0-9]{40}$/i.test(commit) ? commit.slice(0, 7) : undefined;
const buildLabel = 'v' + version + ' · ' + (shortCommit ? 'build ' + shortCommit : 'local build');

export default defineConfig({
  plugins: [react()],
  define: { __TALUS_BUILD_LABEL__: JSON.stringify(buildLabel) },
  base: '/talus1/',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
