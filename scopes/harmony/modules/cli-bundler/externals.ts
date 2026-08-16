/**
 * Packages kept OUT of the bundle and installed as real npm packages next to it.
 *
 * The bar for adding something here is deliberately high - every entry is weight we ship and a
 * version we must resolve. Only these categories qualify:
 *
 * A. **native addons** - the module's real payload is a `.node` binary, or a per-platform optional
 *    dependency picked at require time. esbuild can only inline JavaScript.
 * B. **runtime-path consumers** - modules a *child process* or worker loads by absolute path, so
 *    the file must exist on disk.
 * C. **toolchains resolved by string from user envs** - a user's env asks bit to load
 *    `babel-loader` / a webpack plugin by name; those must resolve as ordinary packages.
 *
 * NOTE: this list starts small on purpose. `bit-bundle2` carried ~120 entries, the large majority of
 * which were react/node/mdx env dependencies that no longer exist on this branch (see
 * `remove-core-envs-from-manifest`). Entries are added back only with evidence of a real failure,
 * and `bundle.ts` reports any entry it cannot resolve a version for so the list stays honest.
 */

/** A. native addons */
const NATIVE = [
  // the pnpm v12 Rust engine - `index.js` requires `@pnpm/napi.<platform>-<arch>` at runtime
  '@pnpm/napi',
  '@parcel/watcher',
  '@lydell/node-pty',
  'fsevents',
  '@rspack/core',
  'bufferutil',
  'utf-8-validate',
];

/** B. loaded by path at runtime (workers / child processes / compiler servers) */
const RUNTIME_PATH = [
  // `ts-server-client` spawns `typescript/lib/tsserver.js`; the typescript aspect also hands lib
  // files to the compiler by path
  'typescript',
  // `addNodeGypToPath()` (`scopes/dependencies/pnpm/node-gyp-bin.ts`) does
  // `require.resolve('node-gyp/bin/node-gyp.js')` to write a PATH wrapper before pnpm spawns a
  // native package's `"install": "node-gyp rebuild"` script - inlined, there is no on-disk file for
  // that resolve to point at, so the wrapper never gets written (the failure is caught and only
  // warned on) and `node-gyp rebuild` finds nothing on PATH. Confirmed via e2e: bundled install of a
  // node-gyp-built dependency failed with `node-gyp rebuild exited with exit status: 127`.
  'node-gyp',
];

/** C. toolchains resolved by string from user envs */
const TOOLCHAINS = [
  // NOT `@babel/core` either (2026-08-16) - but this is a different kind of removal from the three
  // below, worth being precise about. §19b (2026-08-12) traced two always-loaded reachability paths
  // and concluded `@babel/core` "stays in externals.ts... removing it now would break aspect-loader
  // and scope's version-tagging path". One of those two paths is gone on its own - `react-docgen`
  // (the `version.ts` -> `react-parser.ts` consumer §19b cited) no longer exists anywhere in the
  // source tree. The other is still real and unchanged: `aspect-loader.main.runtime.ts` still
  // statically imports `replaceFileExtToJs` from `@teambit/compilation.modules.babel-compiler`,
  // which does `import * as babel from '@babel/core'` at its own top, and aspect-loader is still
  // loaded on every invocation. Marking `@babel/core` external was never *required* for that path,
  // though, the way it was for `process/browser`/`buffer/` below - those are `require.resolve()`
  // calls, which esbuild can never fold (the returned path is environment-dependent), so an
  // unmarked one is always left as a live runtime lookup. `@babel/core` is an ordinary `require()`,
  // which esbuild inlines like any other reachable module. Checked what actually got inlined rather
  // than assuming a trivial unused stub: the full transform engine (`transform.js`,
  // `transformation/index.js`, `config/full.js`, plugin/config loading, ~230 KB across ~50 files) -
  // a real, working subset, not dead code. Rebuilt with the entry removed and pruned from
  // `node_modules`, then re-ran `custom-env-operations.e2e.ts` "should be able to re-tag with no
  // errors" end to end: passes, including its own `[Compiler: BabelCompiler] compile components for
  // artifact dist` task - a *different*, separately-published component-compiler package
  // (`@teambit/compilation.babel-compiler`, distinct from `@teambit/compilation.modules.babel-
  // compiler` above), resolved from the env's own capsule `node_modules` with its own `@babel/core`,
  // independent of bit's bundle either way. Net effect: not a dead-code removal like `webpack` below
  // - `@babel/core` is still genuinely used by bit's own aspect-loader - just no longer needs to be
  // a *separately installed* ~17 MB package when esbuild already inlines the ~230 KB that's actually
  // reachable. See bundle-plan.md §14/§19b (2026-08-16).
  //
  // NOT `webpack`, `process/browser`, or `buffer/` (2026-08-16, all three removed together): the
  // react/node/aspect envs decoupled from `@teambit/webpack` upstream (`refactor(react): use
  // webpack-bundler/webpack-dev-server instead of WebpackMain aspect`, teambit/bit#10610, merged via
  // `remove-core-envs-from-manifest`) - `WebpackMain.createBundler`/`createDevServer` are gone.
  //
  // `webpack` itself: every remaining reference to the package anywhere in this repo
  // (`scopes/webpack/webpack/*.ts`, `config-mutator.ts`, the two event types) is `import type`,
  // erased at compile time - 0 `require("webpack")` in the emitted `bit.app.js`, confirmed by
  // grepping the built bundle.
  //
  // `process/browser` / `buffer/`: these were added for `webpack-fallbacks-aliases.ts`'s two eager
  // `require.resolve()`s, hit via `WebpackMain.createBundler` -> `configFactory` when a workspace's
  // *default* env bundler built a component preview (`custom-env-operations.e2e.ts` "should be able
  // to re-tag with no errors", `bit tag --build`, §14 2026-08-13). That call site no longer exists -
  // the same test now runs its preview bundling through the *external*, per-env
  // `@teambit/webpack.webpack-bundler` package (resolved from the component's own capsule
  // `node_modules`, installed by the env's own `bit install`), never touching bit's local
  // `@teambit/webpack` aspect at all. Re-ran that exact e2e test against a bundle built with both
  // entries removed: passes, `running Webpack bundler. Succeeded` with neither package installed
  // anywhere near the bundle (verified `node_modules/{buffer,process}` absent). See bundle-plan.md
  // §14 (2026-08-16).
  //
  // Residual risk, not yet exercised: `@teambit/preview`'s own `rspack.config.ts` and `@teambit/ui`'s
  // `rspack.common.ts` still `import { fallbacks } from '@teambit/webpack'` (`webpack-fallbacks.ts`,
  // the ~20-package polyfill list, unaffected by the #10610 refactor - it's consumed by bit's own
  // preview/UI rebuild path, not the env's bundler). If that fallback path ever runs with a
  // `process/browser` or `buffer/` requirement live, it would need these back. Every attempt to
  // reach it locally (`custom-env-operations-2.e2e.ts`'s `react-no-compiler-env` scenario) currently
  // crashes earlier on the unrelated, still-open `@teambit/mdx.modules.mdx-v3-options` gap (§10, §14),
  // so this path could not be exercised end-to-end this session. If it starts failing with
  // `Cannot find module 'process/browser'` or `'buffer/'` again after that gap closes, restore both
  // entries here rather than re-diagnosing from scratch.
];

/**
 * D. the UI/preview *rebuild* surface - **opt-in, off by default** (`npm run bundle -- --ui-bundling`).
 *
 * These are the packages the UI and preview rspack configs reach for by name -
 * `resolveAlias()`, `styleRules()`, `postCssConfig`. rspack loads those files itself, so a copy
 * inlined into `bit.app.js` is invisible to it and they have to exist on disk.
 *
 * **`bit start` no longer needs any of them.** It serves the pre-built UI and preview bundles that
 * ship in `@teambit/ui/artifacts` and `@teambit/preview/artifacts` (copied into the shims by
 * `generate-shim-packages`), and that path runs no bundler at all: `express.static` for the shell,
 * and a generated one-line entry that imports the preview pre-bundle. Component previews are built
 * by the *env's* own bundler, resolved from the user's workspace, not from bit. See
 * `bundle-plan.md` §17.
 *
 * What is left is only the *fallback*: if a workspace resolves preview/ui aspects the shipped
 * artifact was not built with (an env contributing its own preview runtime, say), the hash misses
 * and bit rebuilds. That rebuild is what this group buys, and it costs the entire saving -
 * **231 MB to 1.3 GB** measured: `@teambit/*` UI packages alone are 365 MB, `monaco-editor` 77 MB
 * (via `@teambit/code.ui.code-editor`), `@teambit/react` 9.9 MB plus ~29 MB of transitive env.
 *
 * So it stays off by default: a bundled bit serves the pre-bundle or reports that it cannot, rather
 * than shipping a gigabyte to cover a case the artifact should have covered.
 */
export const UI_BUNDLING_EXTERNALS = [
  // aliased into the browser bundle so every component shares one copy
  'react',
  'react-dom',
  '@mdx-js/loader',
  '@teambit/mdx.modules.mdx-v3-options',
  '@teambit/react',
  '@teambit/base-react.navigation.link',
  '@teambit/base-ui.graph.tree.recursive-tree',
  '@teambit/component.ui.component-compare.context',
  '@teambit/semantics.entities.semantic-schema',
  '@teambit/code.ui.code-editor',
  '@teambit/api-reference.hooks.use-api',
  '@teambit/api-reference.hooks.use-api-renderers',
  '@teambit/lanes.hooks.use-lanes',
  '@teambit/lanes.entities.lane-diff',
  // loaders
  'postcss-loader',
  'resolve-url-loader',
  'sass-loader',
  'sass',
  '@rspack/dev-server',
];

/**
 * E. evaluated when the UI aspect is *imported*, not when the UI is built.
 *
 * `postcss.config.ts` builds `postCssConfig` at module scope, and `rspack.browser.config.ts` imports
 * it at module scope, and `ui.main.runtime.ts` imports *that* - so these two `require.resolve` calls
 * run on every bit command that loads the UI aspect, whether or not anything is ever bundled.
 * They are ~50 KB together, so they are cheaper to ship than to make lazy.
 */
const UI_EAGER = ['postcss-flexbugs-fixes', 'postcss-normalize'];

/** misc - things known to break when inlined */
const MISC = [
  // only exists under yarn pnp; `require('pnpapi')` is guarded by a try/catch
  'pnpapi',
  // installs a global Error.prepareStackTrace hook - must be the process-wide singleton
  'source-map-support',
];

const BASE_EXTERNALS = [...NATIVE, ...RUNTIME_PATH, ...TOOLCHAINS, ...UI_EAGER, ...MISC];

export function getExternals(opts: { uiBundling?: boolean } = {}): string[] {
  return opts.uiBundling ? [...BASE_EXTERNALS, ...UI_BUNDLING_EXTERNALS] : BASE_EXTERNALS;
}

/**
 * externals that must NOT end up in the generated package.json - they're either optional, provided
 * by the platform, or intentionally allowed to be missing at runtime.
 */
export const externalsNotInstalled = new Set(['pnpapi', 'fsevents']);
