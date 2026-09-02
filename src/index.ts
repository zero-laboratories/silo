import { spawnSync } from 'node:child_process';
import { buildCli } from './cli.js';

if (!process.execArgv.includes('--experimental-ffi')) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-ffi', process.argv[1], ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(res.status ?? 1);
}

buildCli().parse(process.argv);