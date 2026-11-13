import type { Plugin } from 'esbuild';

/**
 * Packages reachable only from code paths that are out of scope for the bundled CLI, or already
 * broken there for unrelated missing-package reasons (see the comment below on each). Genuinely
 * excluded from the bundle - not moved to `externals.ts` alone, which would still cost install size
 * (see `UI_BUNDLING_EXTERNALS` in `externals.ts` for why `@rspack/core` needs both).
 *
 * - `@rspack/dev-server`: only constructed inside `UIServer.dev()` (`ui-server.ts`), which only runs
 *   behind `bit start --dev` - explicitly out of scope for the bundle (`bundle-plan.md` OQ2).
 * - `workbox-webpack-plugin`: only constructed inside `createRspackBrowserConfig`
 *   (`rspack.browser.config.ts`), the UI rebuild-fallback path - already opt-in/off by default
 *   (`--ui-bundling`, `bundle-plan.md` §8.3/§17d) and already throws earlier in the same function,
 *   at `resolveAlias()`'s `require.resolve('@teambit/code.ui.code-editor')` and friends, before ever
 *   reaching this package in the default build. Stubbing it changes no currently-working behavior.
 * - `@rspack/core` (2026-08-19): called (not `new`'d) from `UiMain.build` (`BundleUiTask`),
 *   `UIServer.dev()`, and `buildPreBundlePreview` (`PreBundlePreviewTask` / the hash-mismatch rebuild
 *   fallback) - all part of the same UI/preview rebuild surface as the two above, but eagerly
 *   *imported* (not just conditionally reached) at the top of always-loaded core-aspect files, so
 *   without this stub the default build would fail to resolve it at all rather than merely warn. At
 *   42 MB it was the single biggest external in the default distribution - see `bundle-plan.md` §14
 *   2026-08-19.
 *
 * `@rspack/dev-server`/`workbox-webpack-plugin` pull in the real `webpack` npm package internally for
 * their own needs (~7 MB combined, confirmed via `metafile.json` - see `bundle-plan.md` §14
 * 2026-08-16), despite `webpack` itself having no other reason to be in the bundle.
 */
const STUBBED = new Set(['@rspack/core', '@rspack/dev-server', 'workbox-webpack-plugin']);
const STUBBED_FILTER = /^(@rspack\/core|@rspack\/dev-server|workbox-webpack-plugin)$/;

function stubSource(packageName: string): string {
  const message = `${packageName} is not available in the bundled bit distribution (excluded to save size - it is only reachable from bit start --dev or the UI rebuild fallback, both out of scope for the bundle; see bundle-plan.md).`;
  return [
    // a plain function, not a class: it must throw the same friendly message whether the real
    // export is constructed (`new RspackDevServer(...)`) or called directly (`rspack(config)`,
    // `@rspack/core`'s shape) - a class would throw a generic "cannot be invoked without 'new'" for
    // the latter instead of this message.
    `function BitBundleStub() { throw new Error(${JSON.stringify(message)}); }`,
    // a Proxy so any named export, default export, or nested property access (e.g.
    // `WorkboxWebpackPlugin.GenerateSW`) resolves to the same throwing function, regardless of the
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
      build.onResolve({ filter: STUBBED_FILTER }, (args) => {
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
