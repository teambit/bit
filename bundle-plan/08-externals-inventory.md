# 8. What is installed next to the bundle, and why

[← back to bundle-plan index](../bundle-plan.md)

This is the section to optimise against. The bundle itself is 67 MB; **161 MB is installed
dependencies**, so this is where the remaining weight lives.

### 8.1 The externals (started at 11, now 10 — two rounds of removal, one addition, and one move to §8.3 — see §15e, §14 2026-08-16, §14 2026-08-19)

Every entry was verified against the emitted bundle — the "sites" column is the number of distinct
files in `bit.app.js` that actually `require()` it.

| package                               | installed  | sites  | why it cannot be inlined                                                                                          | who needs it                                                                                        | droppable?                                                                                                                                                                           |
| ------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~`@rspack/core`~~                    | ~~42 MB~~  | ~~7~~  | —                                                                                                                 | —                                                                                                   | **done — moved to `UI_BUNDLING_EXTERNALS` + stubbed for the default build, 2026-08-19, see §14 and §8.3.** Was the single biggest external.                                          |
| `@pnpm/napi`                          | **40 MB**  | 3      | Rust engine, per-platform optional dep                                                                            | `@teambit/pnpm` (read-config, lynx), `@teambit/pkg` (packer)                                        | no — `bit install` / `bit create` need it                                                                                                                                            |
| `typescript`                          | **23 MB**  | 92     | `ts-server-client` spawns `typescript/lib/tsserver.js` by path; the compiler is handed `lib.*.d.ts` paths         | `@teambit/typescript`, `@teambit/envs` fallback compiler, `tsutils`                                 | partly — see §8.2                                                                                                                                                                    |
| `@babel/core`                         | **17 MB**  | 73     | `aspect-loader` (always-loaded) pulls it via `babel-compiler`; `scope`'s `version.ts` pulls it via `react-docgen` | `aspect-loader.main.runtime.ts`, `scope/objects/models/version.ts`, dozens of bundled babel plugins | not via `BabelAspect` removal (done) — see §19b for the two remaining levers                                                                                                         |
| ~~`webpack`~~                         | ~~14 MB~~  | ~~8~~  | —                                                                                                                 | —                                                                                                   | **done — removed 2026-08-16, see §14**                                                                                                                                               |
| ~~`mocha`~~                           | ~~2.2 MB~~ | ~~2~~  | —                                                                                                                 | —                                                                                                   | **done — removed 2026-08-10, see §15e**                                                                                                                                              |
| `@parcel/watcher`                     | 588 KB     | 1      | native `.node`                                                                                                    | `@teambit/watcher`                                                                                  | no                                                                                                                                                                                   |
| `@lydell/node-pty`                    | ~1 MB      | 1      | native `.node`                                                                                                    | `@teambit/bit` server-forever (the PTY daemon)                                                      | only if `bit server-forever` is dropped                                                                                                                                              |
| `bufferutil` / `utf-8-validate`       | small      | 2 each | native `.node`                                                                                                    | optional accelerators for `ws`                                                                      | product-level yes, bundler-level no — see §16b                                                                                                                                       |
| `source-map-support`                  | small      | 1      | installs a process-wide `Error.prepareStackTrace` hook                                                            | `@babel/register`                                                                                   | no                                                                                                                                                                                   |
| ~~`process/browser`~~ / ~~`buffer/`~~ | ~~small~~  | ~~4~~  | —                                                                                                                 | —                                                                                                   | **done — removed 2026-08-16, see §14** (residual risk: `@teambit/preview`/`@teambit/ui`'s own rspack `fallbacks` import is unaffected and untested — see the note in `externals.ts`) |
| `pnpapi` / `fsevents`                 | —          | 0      | declared external, never installed                                                                                | guarded/optional requires                                                                           | n/a                                                                                                                                                                                  |

Plus ~4 MB of `caniuse-lite`, 3.3 MB `terser-webpack-plugin`, 2.3 MB `terser`, and the transitive
tail — all pulled in by webpack/rspack, not requested directly.

### 8.2 Optimisation levers, roughly in order of value

1. ~~**Make `@rspack/core` optional (≈ 42 MB).**~~ **Done, 2026-08-19** — moved to
   `UI_BUNDLING_EXTERNALS` (§8.3) and stubbed for the default build (`stub-dev-only-plugin.ts`, same
   mechanism as `@rspack/dev-server`). §17's pre-bundle work made this safe: `bit start` resolves the
   UI graph from the shipped `artifacts/` now, never re-resolving each package, so the only remaining
   real call sites (`BundleUiTask`, `UIServer.dev()`, `PreBundlePreviewTask`/the rebuild fallback) are
   all already inside the UI-bundling surface this group exists for. Measured: externals 97 MB → 63 MB,
   total shipped distribution 250 MB → 216 MB - see §14 2026-08-19. (`webpack` itself is no longer in
   the externals at all either — done, §14 2026-08-16: the react/node/aspect envs bundle through the
   external, per-env `@teambit/webpack.webpack-bundler` package now, never through bit's local
   `@teambit/webpack` aspect.)
2. **Decide who owns `typescript` (23 MB).** A user's env already brings its own TypeScript; bit ships
   a second copy mostly so `ts-server` and the fallback compiler have one. Resolving from the
   workspace with a lazy fallback is the same trade-off as (1).
3. **`@babel/core` (17 MB).** Same question. Note the 77 require sites are overwhelmingly _bundled
   babel plugins_ asking for their peer, not bit code — so inlining babel is also plausible.
4. **Drop `bufferutil` / `utf-8-validate`.** Pure optional accelerators for `ws`.
5. **Audit the bundle's own 67 MB** via `bundle/metafile.json`. The `aspectsWithoutMainRuntime` list
   (9 UI-only aspects) is a hint that a lot of React UI code is being pulled into a CLI bundle
   through index barrels and never executed. Marking the UI-bundling packages external already cut
   the bundle from 66.5 MB → 61.4 MB, which suggests more is reachable the same way.
6. **`--minify`** — measured 2026-08-16, see §14. Bundle 78.3 MB → 39.6 MB; warm `bit --help`
   ~770ms → ~700ms locally (~9%). Real but not the dominant lever - see §14 for why.

### 8.3 The `--ui-bundling` group — measured, and deliberately off

`bit start` builds an rspack config full of `require.resolve('<pkg>')` — loader paths and
`resolve.alias` entries — and rspack then loads those files itself, so a copy inlined in
`bit.app.js` is invisible to it. Supplying them means installing:

`react`, `react-dom`, `@mdx-js/loader`, `@teambit/mdx.modules.mdx-v3-options`, `@teambit/react`,
`@teambit/base-react.navigation.link`, `@teambit/base-ui.graph.tree.recursive-tree`,
`@teambit/component.ui.component-compare.context`, `@teambit/semantics.entities.semantic-schema`,
`@teambit/code.ui.code-editor`, `@teambit/api-reference.hooks.*`, `@teambit/lanes.*`,
`postcss-loader`, `postcss-flexbugs-fixes`, `postcss-normalize`, `resolve-url-loader`, `sass-loader`,
`sass`, `@rspack/dev-server`, `@rspack/core` (moved here 2026-08-19, see §8.2 item 1 and §14).

**Measured: 231 MB → 1.3 GB.** `@teambit/*` UI packages alone are 365 MB, `monaco-editor` 77 MB (via
`@teambit/code.ui.code-editor`), `date-fns` 36 MB, `@bitdev/*` 29 MB, `relative-time-format` 20 MB.
That is the entire saving, gone — so the group is behind a flag, not in the default build. Making
`bit start` viable needs a different approach (lazy install, or resolving the UI graph from the
pre-bundled UI artefact rather than re-resolving each package), not a bigger externals list.

Note it also required `legacy-peer-deps=true` in the generated `.npmrc`: the externals are a curated
slice of a tree pnpm already resolved, and npm's strict peer algorithm re-litigates it (e.g.
`@teambit/api-reference.hooks.use-api` still declares react `^16 || ^17` against a react-19
workspace).
