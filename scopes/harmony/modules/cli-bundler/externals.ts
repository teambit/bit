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
];

/** C. toolchains resolved by string from user envs */
const TOOLCHAINS = ['webpack', '@babel/core'];

/**
 * D. the UI/preview bundling surface - **opt-in, off by default** (`npm run bundle -- --ui-bundling`).
 *
 * `bit start` hands rspack a config full of `require.resolve('<pkg>')` - loader paths and
 * `resolve.alias` entries. rspack loads those files itself, so they must exist on disk as ordinary
 * packages; a copy inlined into `bit.app.js` is invisible to it. Without them `bit start` fails with
 * `Cannot find module '@teambit/mdx.modules.mdx-v3-options'`.
 *
 * MEASURED COST: including this group takes the distribution from **231 MB to 1.3 GB** - it wipes
 * out the entire saving. `@teambit/*` UI packages alone are 365 MB, `monaco-editor` 77 MB (via
 * `@teambit/code.ui.code-editor`), `@teambit/react` 9.9 MB and its transitive env another ~29 MB.
 * The flag exists so the trade-off stays measurable; shipping it by default would be pointless.
 * See `bundle-plan.md` §9 for what to do about it instead.
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
  'postcss-flexbugs-fixes',
  'postcss-normalize',
  'resolve-url-loader',
  'sass-loader',
  'sass',
  '@rspack/dev-server',
];

/** misc - things known to break when inlined */
const MISC = [
  // only exists under yarn pnp; `require('pnpapi')` is guarded by a try/catch
  'pnpapi',
  // installs a global Error.prepareStackTrace hook - must be the process-wide singleton
  'source-map-support',
];

const BASE_EXTERNALS = [...NATIVE, ...RUNTIME_PATH, ...TOOLCHAINS, ...MISC];

export function getExternals(opts: { uiBundling?: boolean } = {}): string[] {
  return opts.uiBundling ? [...BASE_EXTERNALS, ...UI_BUNDLING_EXTERNALS] : BASE_EXTERNALS;
}

/**
 * externals that must NOT end up in the generated package.json - they're either optional, provided
 * by the platform, or intentionally allowed to be missing at runtime.
 */
export const externalsNotInstalled = new Set(['pnpapi', 'fsevents']);
