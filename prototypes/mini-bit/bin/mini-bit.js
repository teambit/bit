#!/usr/bin/env node
import { Harmony } from '../src/harmony/harmony.js';
import { CLIAspect } from '../src/cli/cli.aspect.js';
import { BitAspect } from '../src/bit/bit.aspect.js';
import { trace, summarize } from '../src/harmony/tracer.js';

const argv = process.argv.slice(2);
const eager = process.env.BIT_EAGER === '1';
const t0 = Date.now();

async function main() {
  trace(`mode=${eager ? 'eager' : 'lazy'}`);

  let harmony;
  if (eager) {
    // Eager mode mirrors today's Bit: register all manifests via BitAspect,
    // then force every reachable aspect to resolve before dispatch.
    harmony = await Harmony.load([BitAspect], 'main', {});
    for (const id of harmony.manifests.keys()) {
      // Skip BitAspect itself; it's already resolved by load().
      if (!harmony.instances.has(id)) await harmony.resolve(id);
    }
  } else {
    // Lazy mode: register all manifests (cheap — pure data, no runtime imports),
    // but only resolve CLI. The dispatcher triggers further resolves on demand.
    harmony = await Harmony.load([CLIAspect], 'main', {}, [BitAspect]);
  }

  const cli = harmony.get(CLIAspect.id);
  await cli.run(argv);
}

main()
  .then(() => summarize(Date.now() - t0))
  .catch((err) => {
    process.stderr.write(`error: ${err.message}\n`);
    if (process.env.DEBUG) process.stderr.write(err.stack + '\n');
    process.exit(1);
  });
