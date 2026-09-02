import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node26',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
  jsxImportSource: '@opentui/react',
  banner: {
    js: '#!/usr/bin/env node',
  },
  sourcemap: 'linked',
  sourcesContent: true,
  logLevel: 'info',
};

if (watch) {
  build({ ...options, watch: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  build(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
