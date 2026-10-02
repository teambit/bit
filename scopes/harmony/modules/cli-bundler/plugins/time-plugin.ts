import type { Plugin } from 'esbuild';

/**
 * Print how long an esbuild run took.
 *
 * It is a plugin rather than a timer around the `build()` call because esbuild reports its own
 * lifecycle: `onStart`/`onEnd` bracket the work esbuild actually did, excluding the time spent
 * assembling options and the generated entry. That distinction matters when reading the output -
 * "bit bundle finished in 4.7s" is the bundling, not the whole task, and a slow task with a fast
 * bundle points at the surrounding steps (resolution, shim generation, asset copying) instead.
 *
 * `label` names the run, since the CLI bundle and each worker bundle are separate esbuild
 * invocations that would otherwise be indistinguishable in the log.
 */
export function timePlugin(label: string): Plugin {
  return {
    name: 'bit-time',
    setup(build) {
      let start = 0;
      build.onStart(() => {
        start = Date.now();
      });
      build.onEnd(() => {
        // eslint-disable-next-line no-console
        console.log(`[bundle] ${label} finished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      });
    },
  };
}
