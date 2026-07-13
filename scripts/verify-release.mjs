/* global console, process */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checks = [
  {
    label: 'headless simulation',
    directory: 'spikes/headless-sim',
    commands: [
      ['npm', ['test']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'bench']],
    ],
  },
  {
    label: 'trait runtime',
    directory: 'packages/trait-runtime',
    commands: [
      ['npm', ['test']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'bench']],
    ],
  },
  {
    label: 'run director',
    directory: 'packages/run-director',
    commands: [
      ['npm', ['test']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'bench']],
    ],
  },
  {
    label: 'web toy',
    directory: 'apps/web-toy',
    commands: [
      ['npm', ['test', '--', '--run']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'verify:assets']],
      ['npm', ['run', 'verify:content']],
      ['npm', ['run', 'build']],
      ['npm', ['run', 'verify:artifact']],
      ['npm', ['run', 'verify:served']],
    ],
  },
];

console.log('\n[verify-release] supply chain');
try {
  execFileSync('npm', ['run', 'verify:supply-chain'], { cwd: workspaceRoot, stdio: 'inherit' });
} catch (error) {
  const status = typeof error?.status === 'number' ? error.status : 1;
  console.error(`[verify-release] supply-chain gate failed with exit ${status}`);
  process.exit(status);
}

for (const check of checks) {
  const cwd = resolve(workspaceRoot, check.directory);
  console.log(`\n[verify-release] ${check.label}`);
  for (const [executable, args] of check.commands) {
    console.log(`[verify-release] ${executable} ${args.join(' ')}`);
    try {
      execFileSync(executable, args, { cwd, stdio: 'inherit' });
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 1;
      console.error(`[verify-release] failed in ${check.directory} with exit ${status}`);
      process.exit(status);
    }
  }
}

console.log('\n[verify-release] all deterministic and artifact gates passed');
