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
