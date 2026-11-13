import type { Plugin } from 'esbuild';
import { WORKER_ENTRIES } from '../worker-entries';

/**
 * Rewrites `require.resolve('./jest.worker')` (and any other declared worker entry) to the path of
 * the standalone worker bundle that `build-workers.ts` emits.
 *
 * The rewritten specifier stays *relative to the bundle file*, and `require.resolve` in the emitted
 * CJS resolves relative to the file it sits in - so `./workers/jest.worker.js` lands on
 * `<bundleDir>/workers/jest.worker.js` wherever the distribution is installed.
 */
export function workerEntryPlugin(): Plugin {
  const filter = new RegExp(WORKER_ENTRIES.map((entry) => `(?:${entry.matches.source})`).join('|'));
  return {
    name: 'bit-worker-entries',
    setup(build) {
      build.onResolve({ filter }, (args) => {
        if (args.kind !== 'require-resolve') return undefined;
        const entry = WORKER_ENTRIES.find((candidate) => candidate.matches.test(args.path));
        if (!entry) return undefined;
        return { path: `./${entry.outPath}`, external: true };
      });
    },
  };
}
