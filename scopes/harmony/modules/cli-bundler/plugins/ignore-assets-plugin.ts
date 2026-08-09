import type { Plugin } from 'esbuild';

/**
 * The main runtime never renders anything, but it transitively imports UI modules that pull in
 * stylesheets and mdx. Resolve them to an empty CJS module instead of failing the build.
 *
 * This replaces `esbuild-plugin-ignore` used by `bit-bundle2` - one less dependency, and it keeps
 * the ignore list next to the reason for it.
 */
const IGNORED = /\.(css|scss|sass|less|mdx|md)$/;

export function ignoreAssetsPlugin(): Plugin {
  return {
    name: 'bit-ignore-assets',
    setup(build) {
      build.onResolve({ filter: IGNORED }, (args) => ({
        path: args.path,
        namespace: 'bit-ignored-asset',
      }));
      build.onLoad({ filter: /.*/, namespace: 'bit-ignored-asset' }, () => ({
        contents: 'module.exports = {};',
        loader: 'js',
      }));
    },
  };
}
