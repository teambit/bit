import type { Plugin } from 'esbuild';

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
