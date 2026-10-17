// Prepare fresh copies of one exported-main workspace before each complete
// `bit lane create` benchmark run. Hyperfine excludes this setup from timing.
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const source = process.env.BIT_LANE_BENCH_SOURCE;
const destination = process.env.BIT_LANE_BENCH_DESTINATION;
if (!source || !destination) {
  throw new Error('Set BIT_LANE_BENCH_SOURCE and BIT_LANE_BENCH_DESTINATION');
}
for (const variant of ['node', 'rust']) {
  const target = join(destination, variant);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true, dereference: false });
}
