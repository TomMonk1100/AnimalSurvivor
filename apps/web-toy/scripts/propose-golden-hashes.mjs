/* global console, process, URL */
import { spawnSync } from 'node:child_process';

const cwd = new URL('..', import.meta.url).pathname;
const result = spawnSync(
  'npm',
  ['test', '--', '--run', 'test/golden-replay-corpus.test.ts', 'test/stress-parity.test.ts'],
  {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ANIMAL_SURVIVOR_GOLDEN_MODE: 'propose' },
  },
);
if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`Golden proposal test run failed with exit ${result.status}:\n${result.stdout}\n${result.stderr}`);
}
const output = `${result.stdout}\n${result.stderr}`;

const corpusMatch = output.match(/\[golden:propose\] (\{[^\n]+\})/);
const stressMatch = output.match(/\[stress:propose\] ([0-9a-f]{16})/);
if (corpusMatch?.[1] === undefined || stressMatch?.[1] === undefined) {
  throw new Error('Golden proposal run completed without emitting the expected deterministic hashes.');
}

console.log(JSON.stringify({
  fiveMinuteHash: stressMatch[1],
  corpus: JSON.parse(corpusMatch[1]),
}, null, 2));
console.log('\nReview this proposal against intended content changes, then update the committed expectations explicitly.');
