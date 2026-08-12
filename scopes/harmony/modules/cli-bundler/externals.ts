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
  // `scope/objects/objects/repository.ts` calls `uidNumber()` (for `bit export --shared <group>`),
  // which spawns a *child node process* on `require.resolve('./get-uid-gid.js')` - a sibling file
  // in the same tiny package, not something a bundle can inline - same shape as the jest.worker
  // entry (§6.4). Confirmed via e2e: bundled `bit export --shared` failed with `Cannot find module
  // './get-uid-gid.js'`.
  'uid-number',
];

/** C. toolchains resolved by string from user envs */
const TOOLCHAINS = [
  'webpack',
  '@babel/core',
  // webpack's own dependency, `require.resolve()`'d by `@teambit/webpack`'s fallback/alias config
  // builders (webpack-fallbacks*.ts) to hand webpack a browser polyfill path for node's `process`
  // global - same "resolved by string, must exist on disk" shape as webpack/babel-loader above, just
  // one level deeper and far smaller. Confirmed via e2e: bundled `bit tag --build` on a workspace
  // whose env still uses webpack failed with `Cannot find module 'process/browser'`.
  'process/browser',
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
