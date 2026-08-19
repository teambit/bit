# 10. Known gaps & limitations

[← back to bundle-plan index](../bundle-plan.md)

1. ~~**`bit start` / the UI dev server does not work** in the default build.~~ **Closed 2026-08-11
   (§17)** — the default build now ships the pre-built UI and preview bundles inside the shims and
   serves them without running a bundler. Remaining limitation: a workspace whose env contributes its
   own preview-runtime aspects misses the `.hash` and falls into the rebuild path, which a default
   bundle cannot perform (§17d, §17h).
2. **41 `require.resolve` calls remain unresolved in the output.** esbuild warns
   _"X should be marked as external for use with require.resolve"_ for `@svgr/webpack`,
   `babel-loader`, `expose-loader`, the `*-browserify` polyfills, `@rspack/dev-server/client/*`, etc.
   All sit inside webpack/rspack config builders — code that produces a config for bundling _someone
   else's_ browser code. They throw only if that path executes. Silent landmines; see §11.
3. **`bit install` inside a bundled workspace requires the externals installed** — `@pnpm/napi` in
   particular. Without `bundle/npm install` you get `--help`, `init`, `status`, `list` but not
   `create`/`install`.
4. **SEA startup is 2× slower than the script launcher**, structurally — Node's compile cache never
   applies to an embedded main script (§9.2). Not fixable by configuration.
5. **The distribution layout is a prototype**, not the shape to publish (§9b). Converting
   `generate-shim-packages.ts` to emit the publishable shape is not done.
6. **9 core aspects have no main runtime** (`react-router`, `notifications`, `changelog`, `code`,
   `command-bar`, `sidebar`, `component-tree`, `user-agent`, `api-reference`) — all UI-only. Expected,
   not a defect.
7. **Not tested on Linux/Windows.** `@pnpm/napi`, `@parcel/watcher` and `@lydell/node-pty` are the
   platform-sensitive pieces; they are externals precisely so `npm install` picks the right binary.
8. **The bundle is built from `dist/`**, so `bit compile` must be current. A stale dist silently
   produces a stale bundle.
9. **The UI-bundling sanity suites (`ui-ssr.e2e.ts`, `ui-start.e2e.ts`) run in neither CI job.**
   Both are gated behind `BIT_E2E_UI_MODE` (see
   [11-e2e-suite.md](11-e2e-suite.md#the-ui-bundling-sanity-suites-ui-ssre2ets-ui-starte2ets--two-modes-both-opt-in-2026-08-19))
   so they don't break under `e2e_test_esbuild_bundle`'s full-suite sweep, but nothing in
   `.circleci/config.yml` sets that variable, so there is currently zero _CI_ coverage proving `bit
start` works against the real, shipped ui/preview pre-bundle (manually verified 2026-08-19,
   16/16 passing — see [18-findings-log.md](18-findings-log.md) — but that doesn't run again on its
   own). A future job would need to run `bd build ... --tasks BundleUI,PreBundlePreview`, save the
   prebundle cache, then run `setup_esbuild_bundle` and the `prebuilt`-mode command from that doc,
   in that order.
10. **Scope UI SSR crashes in `--rebuild` (local dev) mode only — the shipped pre-bundle is fine.**
    `[ssr] failed at '/'`: `window is not defined` inside `useUserAgent`/`useIsMobile`/`Tooltip`,
    falling back to the empty client shell exactly like the bug #10628 fixed upstream. Found
    2026-08-19 by the newly-cherry-picked `ui-ssr.e2e.ts` in `rebuild` mode — the first test to ever
    exercise `bit start`'s SSR path on this branch; not a regression from any change made this
    session. `rspack.common.ts`'s `resolveAlias` (the #10628 fix) is present and applied on both
    configs, so the likely cause is this workspace deliberately carrying **three** live React
    majors/minors (19.2.7, 19.1.0, 18.3.1 — see `workspace.jsonc`'s `overrides` comment, "v17(react 17) contexts are unaffected"). **Confirmed scoped to `--rebuild`**: the same suite run in
    `prebuilt` mode against a real `npm run bundle` build — i.e. against the actual
    `forPreBundle`-filtered, core-aspects-only artifact `BundleUiTask` ships — passed all 4 SSR
    assertions cleanly (16/16 across both suites). The working theory is that `--rebuild` resolves
    the _full_ test workspace's aspect graph (which can pull in a non-core env like
    `teambit.react/react` and a second React major with it), while the shipped artifact's
    core-aspects-only filter never does. Not root-caused further, and not fixed — see
    [18-findings-log.md](18-findings-log.md), 2026-08-19 entries, for the full trace — but the
    practical severity is much lower than first found: it affects local `--rebuild` iteration, not
    what a released bundle actually serves.
