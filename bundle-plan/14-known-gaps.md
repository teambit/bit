# 10. Known gaps & limitations

[← back to bundle-plan index](../bundle-plan.md)

1. ~~**`bit start` / the UI dev server does not work** in the default build.~~ **Closed 2026-08-11
   (§17)** — the default build now ships the pre-built UI and preview bundles inside the shims and
   serves them without running a bundler. Remaining limitation: a workspace whose env contributes its
   own preview-runtime aspects misses the `.hash` and falls into the rebuild path, which a default
   bundle cannot perform (§17d, §17h). **Confirmed to also break `bit build`, not just `bit start`**
   (2026-08-19, see gap 11 below) — the core preview pre-bundle from `build_ui_prebundle`
   (gap 9) is what's missing in that failure, not something env-specific; `e2e_test_esbuild_bundle`
   itself still runs with no pre-bundle at all, so this class of failure is still live there.
   **Reproduced cleanly against a real third-party app 2026-09-06**: `community-cloud` (the
   `bit-cloud` app) owns its own UI root distinct from workspace/scope, so it hits this every time.
   `bit run community-cloud` with `CLIENT_ONLY=true` (skips `bit-cloud`'s own huge backend aspect
   graph, which otherwise blocks getting this far with unrelated staleness) gets rspack into a real
   client build for that root, tracing the aspect shims into `bit.app.js` for a browser target: 18
   bare `node:*` errors + 51 more `Module not found` (the `UI_BUNDLING_EXTERNALS` group, deliberately
   not installed by default, plus a few non-core UI packages missing from the shim surface) = 64
   errors, matching rspack's own count. `bit run` still reports success since the dev server comes up
   regardless of the client compile errors. See
   [18-findings-log.md](18-findings-log.md), 2026-09-06 entry, for the full repro steps and error
   inventory. **Partly mitigated 2026-09-06**: the "UI vendor DLL" work
   ([27-ui-vendor-dll-plan.md](27-ui-vendor-dll-plan.md), design in
   [26-ui-vendor-dll-design.md](26-ui-vendor-dll-design.md)) now ships a `ui-vendor-dll/` artifact
   (`vendor.js` + `vendor-manifest.json`, ~9.6 MB) alongside the existing UI pre-bundle, verified
   end-to-end against a real rebuilt bundle in [18-findings-log.md](18-findings-log.md)'s 2026-09-06
   "Task 5" entry — once Task 1-4's changes are committed together in a real PR. This does not by
   itself close this gap (a workspace/env whose UI root misses the shipped `.hash` still falls into
   the rebuild path this gap describes), but gives that rebuild path a shared vendor chunk to
   reference instead of duplicating React + the core UI aspect surface from scratch. **Amended
   2026-09-06 (Task 6)**: as first shipped, that artifact's manifest was keyed by the building
   install's own pnpm store paths and matched nothing in any other project — it is now keyed by
   package name + subpath, and a consumer must build its `DllReferencePlugin` options through
   `createUiVendorDllReference()` (exported from `@teambit/ui`) rather than passing the manifest file
   to the plugin directly. It also has to serve the artifact's `vendor.css`
   (`getUiVendorDllPaths().cssPath`), since the intercepted modules' css exists only there. Proven
   against a genuinely separate `pnpm install` — see [18-findings-log.md](18-findings-log.md)'s
   2026-09-06 "Task 6" entry and D17. **Still open after 2026-09-07's real end-to-end attempt**: the
   mechanism itself works (real modules genuinely delegate to the DLL in a real consumer), but this
   gap's own repro (`bit run community-cloud`) still shows the same 64-error baseline, because
   bit-cloud's own non-core aspects reach a covered core aspect via its bare package specifier
   (`dist/index.js`) rather than the exact runtime file the DLL's manifest is keyed by — see
   [18-findings-log.md](18-findings-log.md)'s 2026-09-07 entry for the full trace. Closing this gap
   for real needs either broader per-package coverage (more than one entry point) or a different
   matching strategy; not yet decided.
   **Closed 2026-09-07** — fixed at the bundler level, not by expanding the vendor DLL's own
   coverage. `generate-shim-packages.ts` now ships a real, standalone-compilable `browser/` copy of
   every shim's actual local `dist/` output (excluding
   `@teambit/ui`/`@teambit/webpack`/`@teambit/aspect-loader`, genuinely Node/build-tooling-coupled by
   design — see [18-findings-log.md](18-findings-log.md)'s 2026-09-07 entry) plus `@teambit/harmony`'s
   real runtime dependency closure, and wires both in via each shim's own `package.json` `"browser"`
   exports condition — no bit-cloud-side rspack config change needed at all; a `target: 'web'`
   bundler picks it up by default. A second, real bug surfaced once that compile succeeded for the
   first time: the vendor DLL (from Task 6) delegating `@teambit/react-router` and bare
   `react-router-dom`/`react-router`/`@remix-run/router` handed the consumer a react-router context
   instance that didn't match the `<Router>` its own, separately-compiled app root provides -
   `useLocation()` throwing on mount, blank page. Fixed by excluding that whole package family from
   the dll's manifest (same 18-findings-log.md entry) — they still compile fine standalone via the
   browser-barrel fix above, just not shared as one singleton.
   **Verified end-to-end, in an actual browser (Playwright, screenshot-confirmed)**:
   `CLIENT_ONLY=true bit run community-cloud` goes from the original 64-error baseline to **0 rspack
   errors** and a genuinely rendered page — the real bit.cloud landing page (nav bar, hero, live
   search-box animation), matching the released (bvm) `bit` reference byte-for-byte in behavior (same
   benign search-suggest GraphQL warning overlay, landing page rendered underneath either way). This
   is the first time this gap's own repro has produced a working, rendered UI on this branch. +18.4 MB
   total for the browser-barrel/harmony-deps fix (browser barrels + vendored harmony deps), no
   measurable size change for the react-router exclusion (manifest-only) — see
   `01-goal-and-results.md`'s updated size table.
2. ~~**41 `require.resolve` calls remain unresolved in the output.**~~ **Warnings silenced
   2026-09-01** — esbuild warned _"X should be marked as external for use with require.resolve"_ for
   `@svgr/webpack`, `babel-loader`, `expose-loader`, the `*-browserify` polyfills,
   `@rspack/dev-server/client/*`, `jest`, `espree`, etc. All sit inside webpack/rspack config builders
   (or dev-only tooling) — code that produces a config for bundling _someone else's_ browser code, or
   is only reachable behind `--ui-bundling`. Rather than externalizing them (which would reintroduce
   the 231 MB → 1.3 GB blowup D10/D15 deliberately avoided, for packages that are otherwise inert
   unless that gated rebuild path executes), `run-esbuild.ts` now sets
   `logOverride: { 'require-resolve-not-external': 'silent' }`. The underlying `require.resolve()`
   calls are unchanged — they still throw if that gated path ever executes without the package
   installed — this only removes the noise from CI output. See D16.
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
9. ~~**The UI-bundling sanity suites (`ui-ssr.e2e.ts`, `ui-start.e2e.ts`) run in neither CI
   job.**~~ **Closed 2026-08-19** — two new jobs, `build_ui_prebundle` and `e2e_test_ui_prebundle`,
   run in parallel with (not chained in front of) `setup_esbuild_bundle`/`e2e_test_esbuild_bundle`,
   so producing the pre-bundle never delays the main e2e signal. See
   [11-e2e-suite.md](11-e2e-suite.md#the-ui-bundling-sanity-suites-ui-ssre2ets-ui-starte2ets--two-modes-both-opt-in-2026-08-19)
   for the job split. Remaining gap: `rebuild` mode (a local-only, fast-iteration path) still has no
   CI coverage — not pursued, since `prebuilt` mode already covers the shipped artifact and a cold
   `--rebuild` is
   minutes.
10. **Scope UI SSR crashes in `--rebuild` (local dev) mode only — the shipped pre-bundle is fine.**
    `[ssr] failed at '/'`: `window is not defined` inside `useUserAgent`/`useIsMobile`/`Tooltip`,
    falling back to the empty client shell exactly like the bug #10628 fixed upstream. Found
    2026-08-19 by the newly-cherry-picked `ui-ssr.e2e.ts` in `rebuild` mode — the first test to ever
    exercise `bit start`'s SSR path on this branch; not a regression from any change made this
    session. **Confirmed scoped to `--rebuild`**: the same suite run in `prebuilt` mode against a
    real `npm run bundle` build — i.e. against the actual `forPreBundle`-filtered, core-aspects-only
    artifact `BundleUiTask` ships — passed all 4 SSR assertions cleanly (16/16 across both suites).
    #10634 (`fix(ui): provide the ssr browser context above ClientContext`, cherry-picked onto this
    branch - it was opened off this exact finding) fixes the case where the failing component
    renders inside `ClientContext`'s own JSX children, but **does not close this gap**: re-tested
    after cherry-picking it and the identical stack trace still reproduces
    (`useUserAgent → useIsMobile → Tooltip`). Per #10634's own "residual gap" section, this is the
    case it explicitly doesn't cover - a "render plugin" `reactContext` (pubsub, lanes,
    notifications, **user-agent** itself among them) applied by `ServerRenderer` outside the JSX
    tree the fix wraps, so a `Tooltip` rendered through one of those still finds no provider above
    it. Superseded the earlier "three React majors" theory in this entry - unrelated, and not
    what's actually happening. Not root-caused further or fixed this session — see
    [18-findings-log.md](18-findings-log.md), 2026-08-19 entries, for the full trace — but the
    practical severity is much lower than first found: it affects local `--rebuild` iteration, not
    what a released bundle actually serves.
11. ~~**`e2e_test_esbuild_bundle` has a real, currently-unfixed failure caused by the missing
    preview pre-bundle.**~~ **Closed 2026-08-19** — `custom-env-operations-2.e2e.ts`'s "an env with
    a preview/bundler but without a compiler" (`Cannot find module
'@teambit/mdx.modules.mdx-v3-options'`, thrown by `EnvPreviewTemplateTask`/`writePreviewEntry`'s
    `buildPreBundlePreview` helper) is gap 1's "remaining limitation" in practice, not a separate
    bug - `EnvPreviewTemplateTask` needs the _core_ preview pre-bundle (from
    `PreBundlePreviewTask`/`build_ui_prebundle`, gap 9) as a foundation even for a workspace-local,
    non-core env's own preview; without it, it falls into the from-scratch build path that hits gap
    2's unresolved `require.resolve` calls. Verified with two real `npm run bundle` builds of the
    same source: fails without the pre-bundle, passes with it. Same mechanism as gap 9: the test now
    skips itself (`this.skip()` in a `before()` hook) when running against a bundled binary without
    `BIT_E2E_UI_MODE=prebuilt`, and `e2e_test_ui_prebundle` runs it alongside the UI suites - so it
    no longer fails in `e2e_test_esbuild_bundle` (skips there instead) and gets real coverage where
    the pre-bundle is actually available. Verified end to end: all three states (no mode, `pending`;
    `prebuilt` mode, all 11 tests in the file pass). Not a general fix for every test shaped like
    this - each one needs the same opt-in check added individually.

12. ~~**`ui-vendor-dll.e2e.ts` fails `e2e_test_esbuild_bundle`** (`Cannot find module 'assert/'` from
    `--tasks BundleUI` actually invoking rspack) - exactly gap 11's "each one needs the same opt-in
    check added individually" left undone for this file.~~ **Closed 2026-09-08** - added the same
    `uiE2eMode()`/`BIT_E2E_UI_MODE` skip gate `ui-start.e2e.ts`/`ui-ssr.e2e.ts` use. Not wired into any
    CI job's explicit `BIT_E2E_UI_MODE` run: `e2e_test_ui_prebundle` only injects the static
    pre-bundle, not the `--ui-bundling` toolchain this test's real rspack build needs, so it would
    fail there too - a CI job that builds with `--ui-bundling` is a separate piece of work. See
    [18-findings-log.md](18-findings-log.md)'s 2026-09-08 entry.

13. **`bit build` fails with `error TS5107: Option 'moduleResolution=node10' is deprecated`** for any
    component env using the default tsconfig (`scopes/typescript/typescript/tsconfig.default.json`'s
    `"moduleResolution": "node"`, unchanged since 2019) under the pinned `typescript@5.9.2` (bumped
    months ago, #10001/#9915). Surfaced 2026-09-08 in 3/40 `e2e_test_esbuild_bundle` executions
    (`multiple-testers.e2e.ts`, Jest/Mocha-Tester suites) - confirmed unrelated to the `ui-vendor-dll`
    branch's own changes (see [18-findings-log.md](18-findings-log.md)'s 2026-09-08 entry). Not fixed
    here; likely needs either `"ignoreDeprecations": "6.0"` or a `moduleResolution` bump in
    `tsconfig.default.json`, or a `typescript` downgrade - out of scope of this branch's work.
