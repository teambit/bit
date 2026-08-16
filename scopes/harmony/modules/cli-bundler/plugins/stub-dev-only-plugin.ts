import type { Plugin } from 'esbuild';

/**
 * Packages reachable only from code paths that are out of scope for the bundled CLI, or already
 * broken there for unrelated missing-package reasons (see the comment below on each). Genuinely
 * excluded from the bundle - not moved to `externals.ts`, which would still cost install size.
 *
 * - `@rspack/dev-server`: only constructed inside `UIServer.dev()` (`ui-server.ts`), which only runs
 *   behind `bit start --dev` - explicitly out of scope for the bundle (`bundle-plan.md` OQ2).
 * - `workbox-webpack-plugin`: only constructed inside `createRspackBrowserConfig`
 *   (`rspack.browser.config.ts`), the UI rebuild-fallback path - already opt-in/off by default
 *   (`--ui-bundling`, `bundle-plan.md` §8.3/§17d) and already throws earlier in the same function,
 *   at `resolveAlias()`'s `require.resolve('@teambit/code.ui.code-editor')` and friends, before ever
 *   reaching this package in the default build. Stubbing it changes no currently-working behavior.
 *
 * Both packages pull in the real `webpack` npm package internally for their own needs (~7 MB
 * combined, confirmed via `metafile.json` - see `bundle-plan.md` §14 2026-08-16), despite `webpack`
 * itself having no other reason to be in the bundle.
 */
const STUBBED = new Set(['@rspack/dev-server', 'workbox-webpack-plugin']);

function stubSource(packageName: string): string {
  const message = `${packageName} is not available in the bundled bit distribution (excluded to save size - it is only reachable from bit start --dev or the UI rebuild fallback, both out of scope for the bundle; see bundle-plan.md).`;
  return [
    `class BitBundleStub {`,
    `  constructor() { throw new Error(${JSON.stringify(message)}); }`,
    `}`,
    // a Proxy so any named export, default export, or nested property access (e.g.
    // `WorkboxWebpackPlugin.GenerateSW`) resolves to the same throwing class, regardless of the
    // real package's actual export shape or how esbuild's CJS/ESM interop reaches it.
    `module.exports = new Proxy(BitBundleStub, {`,
    `  get(target, prop) { return prop === '__esModule' ? true : BitBundleStub; },`,
    `});`,
  ].join('\n');
}

export function stubDevOnlyPlugin(): Plugin {
  return {
    name: 'bit-stub-dev-only',
    setup(build) {
      build.onResolve({ filter: /^(@rspack\/dev-server|workbox-webpack-plugin)$/ }, (args) => {
        if (!STUBBED.has(args.path)) return undefined;
        return { path: args.path, namespace: 'bit-stubbed-dev-only' };
      });
      build.onLoad({ filter: /.*/, namespace: 'bit-stubbed-dev-only' }, (args) => ({
        contents: stubSource(args.path),
        loader: 'js',
      }));
    },
  };
}
