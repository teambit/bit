# 26. Design: a UI vendor DLL, so a third-party UI root doesn't need a full rebuild

[← back to bundle-plan index](../bundle-plan.md)

> **Scope update, written during planning**: `DllReferencePlugin` intercepts a matching module
> transparently at rspack's resolution layer, wherever it's imported from — so the consuming build
> (`bit-cloud`) does **not** need to pre-split its aspect list into "covered by vendor" vs. "missing"
> before calling `generateRoot`; it only needs to add `DllReferencePlugin` (pointed at the shipped
> manifest) to its own rspack config. That made the "what's already covered" diff function and the
> workspace-side on-demand loader-package install described below **unnecessary for the core fix** -
> every error this session's real repro hit traced back to core-aspect shims redirecting into
> `bit.app.js`, none to a genuinely-missing loader `bit-cloud`'s own, already-installed
> `@teambit/rspack.app-types.react-rspack` doesn't already carry. Dropped from the implementation
> plans as a result (YAGNI) - see
> [27-ui-vendor-dll-plan.md](27-ui-vendor-dll-plan.md) (bit-bundle3 side) and the sibling plan in
> `/Users/giladshoham/dev/temp/bit-cloud-bundle/VENDOR_DLL_INTEGRATION_PLAN.md` (bit-cloud side) for
> what's actually being built. If a genuinely new loader need surfaces during real verification,
> that's a separate, follow-up concern, not a blocker for this design.
>
> **Correction, 2026-09-06 (Task 6)**: "intercepts a matching module transparently at rspack's
> resolution layer" is right about _where_ the interception happens but wrong about what counts as
> "matching". `DllReferencePlugin` matches by **string equality** between the manifest's keys and the
> path it recomputes for the module it just resolved, relative to its own `context` — and under pnpm
> those paths carry a `.pnpm/<name>@<version>_<peer-hash>` segment specific to the install that built
> the dll, so nothing in a separate project ever matched (silently: a miss just recompiles from
> source). The consuming build still doesn't need to pre-split its aspect list — the transparency
> claim survives — but it does need one more step than "add `DllReferencePlugin` pointed at the
> shipped manifest": the manifest is now keyed by package name + subpath, and
> `createUiVendorDllReference()` (exported from `@teambit/ui`) resolves those specifiers in the
> consuming install to produce the plugin's options. See D17 and
> [18-findings-log.md](18-findings-log.md)'s 2026-09-06 "Task 6" entry.
>
> Status: **in progress.** Written 2026-09-06 after reproducing
> [gap 1](14-known-gaps.md) cleanly for the first time against a real app (`community-cloud`,
> `CLIENT_ONLY=true` — see [18-findings-log.md](18-findings-log.md), 2026-09-06 entries). Next step
> once this doc is approved: `superpowers:writing-plans` for an implementation plan.

## Problem this solves

[Known gap 1](14-known-gaps.md): a UI root that isn't `teambit.workspace/workspace` or
`teambit.scope/scope` (e.g. an app like `community-cloud` with its own UI root) is never covered by
the shipped `.hash`-matched pre-bundle — `BundleUiTask` only ever considers those two hardcoded roots
(`UIROOT_ASPECT_IDS` in `scopes/ui-foundation/ui/bundle-ui.task.ts`). So it always falls into the
"rebuild from scratch" path, which a bundled `bit` cannot do: the generated root's `import`s of core
aspects resolve to shims pointing into `bit.app.js` (the Node CJS bundle), and rspack — building for a
browser target — chokes on `bit.app.js`'s bare `node:*` requires plus everything in
`UI_BUNDLING_EXTERNALS` (deliberately not installed by default, per D10/D15, to avoid a ~1.1 GB
blowup). Reproduced 2026-09-06: 64 rspack errors (18 bare `node:*` + 51 `Module not found`).

This matters most for people actively **developing** an app like `community-cloud` — they need a real
dev server with fast, live iteration, not a one-shot published-artifact check.

## Why not Module Federation

Considered and rejected in favor of the simpler mechanism below. Either approach keeps application
source code completely unaware of the mechanism — `shared`/`exposes`/`externals` config lives in
bit-owned build config (env/bundler layer), never in a component or app author's own code, so this
isn't a factor either way. What tips it: Module Federation's actual value is dynamic remotes
discovered at runtime, independent versioning, and negotiating compatibility between hosts and remotes
built by parties who don't control each other's toolchain. None of that applies here — bit controls
both the host (pre-bundle) and remote (incremental) build with the same tooling, and already enforces
a single React instance system-wide (see the `@apollo/client` context-sharing alias in
`ui/rspack/rspack.common.ts`, §17e). MF's runtime container protocol, manifest plugin, and
remote-loading bootstrap buy nothing here and are a lot of new surface. Plain `externals` + a
runtime-populated global is the same practical outcome with far less new infrastructure.

## Architecture overview

Two new build outputs, both produced during the existing `bit build`/packaging flow
(`BundleUiTask`) — **no change to how workspace/scope's own pre-bundle is built or served today**:

- **A UI vendor DLL.** One `DllPlugin` pass (rspack ships this — confirmed present in
  `@rspack/core@2.1.10`: `DllPlugin`, `DllReferencePlugin`, `DllEntryPlugin`,
  `DllReferenceAgencyPlugin`) over the _same already-resolved_ module graph the existing
  workspace/scope compilation produces — so vendor coverage is exactly "whatever core UI already
  needs" (React, ReactDOM, the `@teambit/ui-foundation`/`@teambit/component.ui.*` helper packages),
  derived from the existing compilation rather than a hand-maintained list. Produces a small entry
  chunk + a `manifest.json` (module name → internal id), shipped inside the shims alongside the
  existing `artifacts/`.
- **The incremental ("remote") build.** Reuses the _existing_ root-generation pipeline
  (`createRoot`/`generateRoot` → rspack) that today is the broken rebuild fallback, scoped down to
  only the aspects _not_ already covered by the vendor DLL, with `DllReferencePlugin` wired in against
  that manifest. Only genuinely app-specific code (e.g. `community-cloud`'s own components) compiles
  from source.

At runtime, a page for an uncovered UI root loads two scripts in order: the vendor DLL chunk (populates
the runtime lookup `DllReferencePlugin` needs), then the incremental build's own entry — still a
complete, self-contained UI root that bootstraps its own render call, just built fast because most of
its imports resolve externally instead of compiling from source.

## Components / pieces that change

- **`BundleUiTask`** (`scopes/ui-foundation/ui/bundle-ui.task.ts`) — after its existing workspace/scope
  compilation, add the `DllPlugin` pass over that same resolved graph, writing
  `artifacts/ui-vendor-dll/` (same shim-copying mechanism that already ships `artifacts/` today).
- **A "what's already covered" check** — extends the existing hash-comparison machinery
  (`shouldServeBundleUi` in `ui.main.runtime.ts`, `writePreviewEntry` in `preview.main.runtime.ts`)
  from a binary hash match/mismatch into: given a third-party UI root's resolved aspects, diff against
  (a) the vendor DLL manifest (package-level) and (b) the known workspace/scope roots, producing the
  _missing_ aspect list to actually compile.
- **The root-generation + rspack config for the incremental build** — reuses the existing
  `createRoot`/`generateRoot` pipeline, scoped to only the missing aspects, with
  `DllReferencePlugin` wired in against the vendor manifest. **To confirm during implementation**:
  whether `createRoot` (currently resolved from `@teambit/harmony.modules.harmony-root-generator`) is
  in-repo or a separately-published component — if external, it may need the same import-and-patch
  treatment this session needed for `bit-cloud`.
- **Workspace-side on-demand installs** — extend the _existing_ phantom-dependency install detection
  (`findPhantomPackages`/`findRequiredPackages` in `scopes/workspace/install/find-required-packages.ts`,
  wired into `install.main.runtime.ts` — the same machinery this session's blockers 1 and 2 kept
  surfacing) to also detect loader packages a workspace's non-core UI-root aspects need but the vendor
  DLL doesn't cover, adding them to the workspace's own policy during `bit install`. Reuses existing
  infra rather than inventing a new install path or a hidden cache — the packages land in the
  workspace's own `node_modules`, visible and normal.
- **Serve/orchestration** (`bit start` / `bit run <app>`, `ApplicationMain.runApp` /
  `UiMain`) — detect an uncovered UI root, run the incremental build in dev-server + watch mode (not
  a one-shot compile) instead of today's broken full-rebuild path, and serve both the vendor DLL
  script and the incremental entry script in the page shell.
- **Dev loop** — the incremental build runs in rspack-dev-server watch mode scoped to just the missing
  aspects; file changes in the app's own components recompile fast, vendor DLL and host untouched.

## Data flow

**Build time** (part of the existing `bit build`/tag/CI flow — same trigger as today):

1. `BundleUiTask` runs as today: resolves workspace+scope's aspect graph, rspack-compiles, produces
   the existing pre-bundle + `.hash`.
2. New: immediately after, the `DllPlugin` pass runs over that _same already-resolved_ module graph
   (no extra resolution work) — emits `ui-vendor-dll/manifest.json` + the vendor chunk, into the
   shim's `artifacts/`.
3. Both ship inside the published bundle exactly as the pre-bundle does today.

**First `bit start`/`bit run <app>` against an uncovered UI root** (e.g. `community-cloud`):

4. Resolve the app's aspect graph (as today).
5. Diff against the vendor manifest + known roots → "missing aspects" list (the app's own).
6. If those missing aspects need loader packages (sass, mdx, etc.) not yet installed → add to the
   workspace's dependency-resolver policy, run install (visible, cached, same phantom-dependency
   mechanism already in this codebase).
7. Start an incremental rspack dev-server compilation covering _only_ the missing aspects,
   `DllReferencePlugin` pointed at the vendor manifest.
8. Serve the page: vendor DLL `<script>` first, then the incremental entry.
9. File change in the app's own code → dev-server recompiles only the incremental bundle.

**Subsequent runs**: steps 4-6 short-circuit (cached); only step 7 re-runs if source or cache is
stale — standard dev-server behavior.

## Error handling

- Missing vendor artifact in an installed bundle (stale/old bundle, stripped by a build flag) → fail
  with a specific message naming what's missing, not a rspack error wall — this is literally what
  [gap 1](14-known-gaps.md) already asks for ("should fail with a clear message... rather than a wall
  of module-not-founds").
- Genuinely unresolvable imports even after the auto-install step → same principle: one aggregated
  "missing package X, needed by aspect Y" message, not raw rspack output.
- Version skew between the vendor DLL and the workspace's own installed React/core-UI version: gate
  with the _same_ hash discipline the `.hash` mechanism already uses, so a mismatch is _detected_
  (triggers falling back to a full rebuild of the vendor-covered pieces) rather than silently shipping
  two React instances into one page.
- Auto-install failing (network, perms) → ordinary `bit install` failure, no new handling needed.

## Testing

- **Unit**: the "what's missing" diff (pure function, fixture-driven), and the phantom-dependency
  extension for UI-root loader detection (same pattern as the existing
  `find-required-packages.spec.ts`).
- **E2e**: new fixture workspace with a second, non-core UI root (following the existing
  `ui-start.e2e.ts` pattern, see [11-e2e-suite.md](11-e2e-suite.md)) — verify `bit build` produces the
  vendor artifact, `bit run <fixture-app>` serves with zero rspack errors against a real
  `npm run bundle` build, and editing the fixture's own component picks up via watch without touching
  the vendor chunk.
- **Real-world**: re-run this session's exact repro (`CLIENT_ONLY=true bit run community-cloud`,
  workspace at `/tmp/bit-cloud` — see [18-findings-log.md](18-findings-log.md) for the minimal repro
  steps: fresh `bit install` via the bundle + the `@teambit/react.react` symlink workaround for
  blocker 1 + `CLIENT_ONLY=true`) and confirm zero rspack errors / a working UI.
- **Regression**: workspace/scope's existing `bit start` output (artifacts, `.hash`) is byte-for-byte
  unchanged — the `DllPlugin` pass is purely additive to `BundleUiTask`.
- **Size check**: the vendor artifact shouldn't meaningfully grow the shipped bundle (it's a manifest +
  thin bootstrap over what's _already_ compiled into the pre-bundle, not a duplicate copy of React
  et al) — confirm it doesn't approach `--ui-bundling`'s 1.1 GB.

## Open questions for implementation

- Is `harmony-root-generator` (`createRoot`) in-repo or externally published? Determines whether the
  incremental-build changes are a normal same-repo edit or need the import-and-patch treatment
  `bit-cloud` needed this session.
- Exact package list the vendor DLL should cover — "derived from the existing compilation's module
  graph" needs a concrete extraction mechanism (walk the compilation's `moduleGraph`? a fixed
  allow-list validated against it?) rather than being fully automatic on day one.
- Where exactly `bit run`/`bit start` currently decide "rebuild" vs "serve" for a _third-party app's_
  UI root specifically (as opposed to workspace/scope) — this session traced the workspace/scope path
  in detail (`shouldServeBundleUi`, `writePreviewEntry`) but not the equivalent decision point for
  `ApplicationMain.runApp`'s own UI-serving logic for an app component.
