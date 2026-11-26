// The bot lab: every venue raced by a field of bots alone (three seeds each, 150 s a race) and
// what became of them counted, to judge a change to the drivers by.
//
//   pnpm bots [out-dir] [venue ...] [--seeds=1,2,3]
//
// Writes <out-dir>/stats.json (default captures/bots) and prints the table. The numbers: laps
// driven (the field's mean, its slowest, its fastest), % of the time off the road and stuck,
// times a driver had to back out, knocks between cars and into scenery, rescues, wrecks, shots
// fired, crates taken, tiles used, mean speed, and seconds to get going again after a spin.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const rest = args.filter((a) => !a.startsWith('--'));
const out = resolve(rest[0] && !/^[a-z-]+$/.test(rest[0]) ? rest.shift() : 'captures/bots');
const seeds = flags.find((f) => f.startsWith('--seeds='))?.slice(8);
const run = spawnSync('pnpm', ['vitest', 'run', '--project', 'content', 'botlab'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    BOTLAB: rest.join(','),
    BOTLAB_OUT: out,
    ...(seeds ? { BOTLAB_SEEDS: seeds } : {}),
  },
});
if (run.status !== 0) process.exit(run.status ?? 1);
console.table(JSON.parse(readFileSync(`${out}/stats.json`, 'utf8')));
console.log(`written to ${out}/stats.json`);
