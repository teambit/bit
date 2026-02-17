# Dev Server Performance Optimization — Context (Source of Truth)

Last updated: 2026-02-17
Repo: /Users/luv/bit.dev/code/\_\_bit
Branch: perf/runtime-optimizations
Head: 7b9a59e0f

## Current Position (Most Important)

The runtime optimization branch has now been merged with latest `master`, including the rspack migration that landed on master:

- `225881d03` — `feat(workspace | preview): migrate from webpack to rspack (#10187)`
- Merge commit on this branch: `7b9a59e0f` — `Merge master into runtime optimizations and port UI start path to rspack`

This means runtime work is no longer on old UI webpack paths. Current optimization/hardening work must target rspack UI paths and current runtime wiring.

---

## Two Workstreams (Current)

### 1. Runtime Optimizations — `perf/runtime-optimizations`

Status: IN PROGRESS (stabilization + UX hardening)

Focus now:

- Keep instant UI boot (already achieved in smoke runs)
- Fully reliable offline-refresh behavior (no blank page)
- Correct dev-server vs preview-server status semantics in user bar
- Eliminate stale SW/cache cross-workspace interference
- Final spacing/layout polish in workspace overview grid

### 2. Rspack Migration — `perf/rspack-migration`

Status: COMPLETED AT CORE LEVEL (merged from master into `perf/runtime-optimizations`)

Focus now:

- Follow-up hardening and compile-time optimizations only
- No migration-bootstrap work unless a concrete gap is identified
- Do not reintroduce runtime regressions while chasing compile wins

---

## What Has Been Achieved

### Compile-state source-of-truth checkpoint (2026-02-17)

- Root cause of stuck `Previews loading`:
  - preview compile status was derived from heuristic client-side guards/maps (including startup timeout assumptions), not from canonical compiler state.
  - compiler event IDs can differ from the env IDs used by UI proxy/state wiring; this caused missed state transitions and stale compile flags.
- Fix implemented:
  - `preview.start-plugin` now resolves incoming compiler event IDs to canonical `envRuntime.id` and publishes `componentServerCompilationChanged` with canonical `env` plus `affectedEnvs`.
  - `preview.start-plugin` now updates `ComponentServer.isCompiling` on compile start/done and initializes new servers as compiling.
  - `dev-server.graphql` now exposes `server.isCompiling` and keeps compilation-changed subscription payloads available to UI.
  - `useWorkspace` now updates `component.server` directly from `componentServerStarted` + `componentServerCompilationChanged` subscriptions and derives preview snapshot state from `component.server.isCompiling` (removed startup compile-guard heuristics and compile map state).
  - `component-preview` no longer marks ready from raw iframe `onLoad` fallback; readiness remains tied to preview runtime events (`LOAD_EVENT` / `preview-size`) so loading skeletons remain visible while runtime is not ready.
- Validation:
  - compile: `bit compile teambit.preview/preview teambit.compilation/bundler teambit.workspace/workspace teambit.preview/ui/component-preview`
  - relink: `node /Users/luv/bit.dev/code/__bit/node_modules/@teambit/bit/dist/app.js link` in `/Users/luv/bit.dev/code/ws/dev-server-test`
  - live GraphQL probe during `start --dev --port 3070`:
    - startup: preview comps `110`, compiling `108`, ready `2`
    - mid compile: preview comps `110`, compiling `103`, ready `7`
    - compile done: preview comps `110`, compiling `0`, ready `110`

### Runtime speedups and rendering behavior

- Three-query progressive loading landed (light → heavy → status deferred)
- Apollo batching disabled to avoid fast-query blocking
- Loader-heavy hooks migrated to avoid global loader spam
- Preview remount storms reduced via identity/memo fixes
- Startup path decoupling improved: UI server can become ready quickly while preview servers continue compiling
- Cloud user-bar based connection indicator flow wired (main vs preview state separation work started)

### Merge + port checkpoint (2026-02-10)

- Merged `master` into this branch and resolved conflicts.
- Ported fallback/SW/history hardening from legacy webpack assumptions into rspack UI config paths.
- Kept server/proxy hardening in current UI server path.

Key files from this merge checkpoint:

- `scopes/ui-foundation/ui/ui-server.ts`
- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`
- `scopes/ui-foundation/ui/rspack/rspack.browser.config.ts`
- `scopes/webpack/webpack/config/webpack.dev.config.ts`

### Loading shell parity checkpoint (2026-02-11)

- Workspace overview loading shell adjusted to match final rendered structure:
  - centered responsive shell bounds,
  - sectioned skeleton groups,
  - card skeletons now include title + preview block + footer metadata row to reduce transition jump.
- Component page loading shell adjusted to match final rendered hierarchy:
  - centered responsive container with top-aligned flow,
  - title/meta row + preview region + tab row + side-panel skeleton blocks.
- Compile validation completed:
  - `bit compile teambit.workspace/workspace teambit.component/component` (success).

### Preview/status stability checkpoint (2026-02-11)

- Root issue found: preview `window.message` events were not scoped to the owning iframe instance, so one preview's load/error events could mutate readiness/status state in other preview cards.
- Fixes:
  - `component-preview` now filters message events by `event.source === currentIframe.contentWindow`.
  - preview placeholders emit preview presence signals (`previewPresenceDelta`) so user-bar can show `Previews loading` while preview servers compile.
  - user-bar connection hook now uses preview presence awareness and a two-strike main health failure guard to reduce online/offline flapping.
- Compile validation completed:
  - `bit compile teambit.preview/ui/component-preview teambit.preview/ui/preview-placeholder teambit.cloud/ui/user-bar` (success).

### Backend status-path rollback checkpoint (2026-02-11)

- Per regression report ("status never renders"), reverted backend-side status-path optimizations:
  - removed GraphQL workspace `components` resolver status-only shortcut logic.
  - restored component status loader path to pre-optimization behavior.
- Status source-of-truth remains `wsComponent.getStatus()`.
- Compile validation completed:
  - `bit compile teambit.workspace/workspace` (success).

### Skeleton layout-fidelity checkpoint (2026-02-11)

- Updated loading placeholders to follow real screen structure instead of centered shell cards:
  - workspace overview: inline status row + native filter/header/grid skeleton order and spacing,
  - component page: top-aligned status row and full-width content skeleton layout,
  - preview areas: structured chrome/canvas skeletons for both iframe preview and card placeholder.
- Compile validation completed:
  - `bit compile teambit.workspace/workspace teambit.component/component teambit.preview/ui/component-preview teambit.preview/ui/preview-placeholder` (success).

### Preview compile-state semantics checkpoint (2026-02-11)

- Root issue: user-bar could show `Online` while preview envs were still compiling because preview state was tracked as unkeyed booleans.
- Fixes:
  - `component-preview` now emits preview status with `previewKey`.
  - `preview-placeholder` now emits preview presence with `previewKey` (including pre-hydration compile windows).
  - `use-dev-server-connection-status` now tracks expected-vs-ready preview key sets and reports:
    - `Previews loading` when expected previews are not all ready,
    - `Online` only when all expected previews are ready.
- Compile validation completed:
  - `bit compile teambit.preview/ui/component-preview teambit.preview/ui/preview-placeholder teambit.cloud/ui/user-bar` (success).

### Workspace-driven preview-state checkpoint (2026-02-11)

- Follow-up fix for remaining mismatch (`Online` while start output still compiling):
  - moved preview presence/readiness signaling to `useWorkspace`, derived from actual workspace component data:
    - expected preview = component has compositions,
    - ready preview = component has `server.url`.
  - removed duplicate preview-presence emission from `preview-placeholder` to avoid conflicting state updates.
- Compile validation completed:
  - `bit compile teambit.workspace/workspace teambit.preview/ui/preview-placeholder` (success).

### Start output UX checkpoint (2026-02-11)

- Fixed command-output silent gap introduced by UI/preview decoupling:
  - `PreviewStartPlugin` now emits staged bootstrap progress immediately (`Preparing preview runtime` → `Creating preview dev servers` → `Waiting for compilation`).
  - Bootstrap stage transitions to success once first compilation starts and fails explicitly on bootstrap errors.
- Compile validation completed:
  - `bit compile teambit.preview/preview` (success).

### Startup gap root-cause checkpoint (2026-02-11, later)

- Root cause of the perceived UI->preview startup gap was confirmed:
  - runtime process was still using stale `dist` where `createRuntime()` awaited `uiServer.dev()` before `initiatePlugins()`.
- Fix applied and validated:
  - compiled `teambit.ui-foundation/ui` so active `node_modules/@teambit/ui/dist/ui.main.runtime.js` now starts preview plugins in parallel with UI dev startup.
  - compiled `teambit.preview/preview` and upgraded bootstrap messaging to explicitly show `loading workspace components -> <count>` before env creation.
- Result:
  - preview bootstrap now appears immediately (including before UI-ready output),
  - remaining delay is isolated to workspace component discovery/loading, not UI/preview startup coupling.

### Start output overlap fix (2026-02-11, later)

- Regression observed: preview bootstrap spinner updates could overlap `Rspack compiled successfully` output (same TTY cursor-control stream), producing corrupted lines like `...successfullyng workspace components`.
- Fix:
  - replaced bootstrap progress from active spinner updates to stable `logger.console` stage lines in `preview.start-plugin`.
  - kept env compile spinners unchanged; only bootstrap-phase rendering changed.
- Validation:
  - `bit compile teambit.preview/preview` (success)
  - `start --dev` smoke confirms clean non-overlapping bootstrap stage lines.

### Startup gap DX hardening checkpoint (2026-02-11, latest)

- Goal: ensure `start --dev` never feels stalled, even when workspace component loading is slow.
- Findings from smoke runs (`dev-server-test`, 213 components):
  - UI server becomes ready quickly, but preview bootstrap can spend ~20-30s in workspace component loading before env servers are created.
  - This delay is not UI/preview coupling anymore; it is inside component discovery/loading before `bundler.devServer()` starts env compilation.
- DX changes in `preview.start-plugin`:
  - added timed heartbeat lines during bootstrap stages (`loading workspace components`, `loading env runtimes`, `creating environments`).
  - stages now emit explicit elapsed timing so users always see that the process is active.
  - stage order clarified (1/3, 2/3, 3/3) to make progress legible.
- Scope decision:
  - Root-cause reduction of the remaining 20-30s gap likely requires deeper optimization in workspace component-loading internals (backend/load pipeline).
  - For now, we improved command DX to avoid “nothing is happening” perception and documented the deeper optimization as a separate performance stream.
- Validation:
  - `bit compile teambit.preview/preview` (success)
  - `start --dev` smoke (`--port 3045`) shows repeated bootstrap progress lines with elapsed time during the slow stage.

### Component status-loader rollback checkpoint (2026-02-11, latest)

- Decision: revert all remaining component-loader changes that were introduced for status/loader acceleration experiments.
- Reverted files:
  - `components/legacy/consumer-component/component-loader.ts`
  - `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts`
- Kept intact:
  - status source of truth remains `wsComponent.getStatus()` (already restored in previous checkpoint),
  - startup DX logging improvements in `preview.start-plugin`.
- Validation:
  - `bit compile teambit.workspace/workspace teambit.legacy/consumer-component teambit.preview/preview` (success).

### Preview iframe runtime optimization checkpoint (2026-02-11, latest)

- Goal: apply high-impact preview optimizations that are applicable in dev without increasing compile-time or HMR churn.
- Implemented:
  - `preview-placeholder` hydration queue now uses adaptive concurrency (4/6/8 based on CPU cores) instead of fixed 16.
  - hydration queue now prioritizes near-viewport entries by distance (visibility-first), rather than pure FIFO.
  - eager auto-warm cap reduced from 96 to `max(16, concurrency * 3)` and root margin tightened (`3200px` -> `1600px`) to reduce offscreen preloading pressure.
  - `component-preview` iframe navigation is now scheduled on paint boundary (`requestAnimationFrame` + `setTimeout(0)`), avoiding heavy navigation work during critical parent render.
  - `component-preview` now boots with an in-iframe `srcdoc` skeleton until real `src` is scheduled, and uses fade-in transition once preview is ready.
  - added containment hints on preview wrapper (`contain`, `content-visibility`, `contain-intrinsic-size`) to reduce parent layout/compositing overhead.
- Files:
  - `scopes/preview/ui/preview-placeholder/preview-placeholder.tsx`
  - `scopes/preview/ui/component-preview/preview.tsx`
  - `scopes/preview/ui/component-preview/preview.module.scss`
- Validation:
  - `bit compile teambit.preview/ui/component-preview teambit.preview/ui/preview-placeholder` (success).
  - `start --dev` smoke (`--port 3052`) booted successfully; no startup crash/regression observed.
- Scope:
  - This is runtime hydration/navigation tuning and UX smoothing; deeper workspace component-loading latency remains separate.

### User-bar preview-state + composition skeleton regression fix checkpoint (2026-02-11, latest)

- Reported regressions:
  - user-bar stuck at `Previews loading` even after preview compile / hard refresh.
  - composition switching repeatedly showed skeletons and could leave preview stuck loading.
  - component overview loading shell resembled iframe-window chrome (undesired).
- Implemented fixes:
  - authoritative preview snapshot synchronization:
    - `use-workspace` now emits `previewSnapshot` events with full `presenceKeys`/`readyKeys`,
    - `use-workspace` also stores latest snapshot on `window.__BIT_PREVIEW_STATUS__` for late listener hydration.
  - user-bar now hydrates from snapshot and ignores unknown ad-hoc preview keys for online/offline signals (prevents stale phantom keys from composition events keeping `Previews loading` forever).
  - `component-preview` URL transition now keeps previous iframe `src` until scheduled navigation runs; no forced `srcdoc` reset on every composition switch.
  - `component-preview` only resets `isPreviewReady` for first load or preview-key change (not every composition URL change), eliminating repeated skeleton flashes on composition switches.
  - component page loading shell simplified to content-oriented skeleton (removed window-like top chrome in loading state).
- Files:
  - `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
  - `scopes/cloud/ui/user-bar/use-dev-server-connection-status.ts`
  - `scopes/preview/ui/component-preview/preview.tsx`
  - `scopes/component/component/ui/component.tsx`
- Validation:
  - `bit compile teambit.cloud/ui/user-bar teambit.workspace/workspace teambit.component/component teambit.preview/ui/component-preview` (success)
  - `start --dev` smoke (`--port 3053`) started successfully
  - `__bd link` executed in `dev-server-test`.

---

## Validation Done In This Checkpoint

- Dependency sync: `bit install`
- Compile success:
  - `teambit.ui-foundation/ui@1.0.879`
  - `teambit.preview/preview@1.0.879`
  - `teambit.workspace/workspace@1.0.879`
  - `teambit.harmony/graphql@1.0.879`
  - `teambit.cloud/ui/user-bar@0.0.43`
  - `teambit.preview/ui/component-preview@1.0.31`
- Startup smoke:
  - `__bd start --dev --no-browser --port 3001 --log` starts without the prior missing module failure (`@rspack/plugin-react-refresh`)

Observed risk in smoke logs:

- Repeated `Watchpack Error: EMFILE: too many open files, watch`

---

## Open Issues (Current)

1. Offline refresh reliability is not signed off yet.

- Requirement: when dev server is killed and browser refreshes, app shell should still render and clearly show offline state.
- Current status: partial hardening done, final end-to-end browser sign-off pending.

2. Status semantics need strict correctness.

- Main UI server offline vs preview servers compiling/restarting must be differentiated.
- Indicator should not mark app offline when only previews are loading/offline.

3. Service worker/cache isolation must hold across multiple branches/workspaces.

- Prevent cache/controller bleed-over when running multiple Bit instances.
- Continue verifying SW tokenization + cache partitioning behavior.

4. Bundle MIME/fallback regressions need regression checks after merge.

- No JS request should be rewritten to HTML (`Unexpected token '<'` class of failures).

5. Workspace overview spacing polish still requires visual sign-off.

- Header-to-grid spacing and aggregation section gaps must remain consistent.

6. `EMFILE` watcher pressure remains a stability risk in `--dev`.

---

## Resume Checklist (Next Session)

1. Run `__bd start --dev` in `/Users/luv/bit.dev/code/ws/dev-server-test`.
2. Browser verification loop:

- boot while previews are still compiling,
- kill dev server + refresh,
- restart dev server and verify auto-recovery without hard refresh,
- confirm user-bar status transitions (offline / previews loading / previews offline / online).

3. Verify no SW errors (`non-precached-url`) and no JS-as-HTML MIME failures.
4. Verify workspace spacing and z-index behavior.
5. Re-run baseline vs optimized measurements before claiming new perf wins.

---

## Constraints (Do Not Break)

- No hardcoded package/dependency lists for shared deps/externals/bundles.
- No global source map disable.
- No `devtool: 'eval'`.
- No runtime regression accepted for boot wins.
- Always compile changed aspects before validation.
- Always verify in browser before closing perf/runtime issues.

---

## Key Lessons (Still Valid)

1. `useDataQuery` can trigger global loader behavior; use carefully.
2. Apollo batching can block fast queries behind slow ones.
3. History fallback must never rewrite asset/hot-update/HMR requests to HTML.
4. UI startup decoupling is sensitive to proxy/init ordering.
5. Runtime uses compiled dist outputs, not source files directly.
6. React 17 constraints apply in workspace UI.
7. Service-worker strategy must account for multi-workspace and multi-branch local usage.

---

## Runtime Hotfix Checkpoint (2026-02-10) — Proxy WS stability + loading shell + graph CSS warning

### Root cause analysis

1. Preview dev servers can restart with a new port, but proxy route registration was previously keyed by route existence and skipped updates. That left stale WS/HTTP targets for `/preview/<env>` and `/_hmr/<env>`.
2. During startup/restart windows, `_hmr` websocket upgrade requests could arrive before a target existed and were not closed cleanly, producing broken proxy socket chains (`EPIPE` / `ECONNRESET`) in the upstream middleware.
3. Workspace overview shell could flicker/blank due to immediate offline transitions and a `null` render path while connection state was oscillating.
4. Graph SCSS warning came from invalid CSS var syntax in `variants.module.scss` (`var(border--color)`).

### Implemented fixes

- `scopes/ui-foundation/ui/ui-server.ts`
  - Added per-env proxy entry map and in-place target updates on restarts.
  - Added clean upgrade socket shutdown for unmatched `_hmr` upgrades.
  - Added socket validity guards before proxying upgrades.
- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`
  - Debounced offline transition (~900ms) to prevent shell flapping.
  - Removed blank render path: always show loading shell when data is still warming.
  - Auto-refresh now triggers only after a real offline->online transition.
- `scopes/component/graph/ui/component-node/variants.module.scss`
  - Replaced invalid `var(border--color)` with concrete rgba shadow value.

### Validation

- `bit compile teambit.ui-foundation/ui teambit.workspace/workspace teambit.component/graph` — success.
- `__bd start --dev --no-browser --port 3001 --log` smoke run:
  - no `[HPM] ... EPIPE/ECONNRESET` lines in captured logs,
  - no SCSS parse warning for `variants.module.scss`,
  - UI server ready and rspack compiles successful.

### Follow-up

- Re-verify in interactive browser session that no loader flicker/blank oscillation occurs under real reconnect sequences.

---

## Runtime Stabilization Checkpoint (2026-02-10, later) — HMR root cause + sidebar fast path + SW isolation

### Root cause analysis

1. `/_hmr/<env>` upgrades were still failing in reconnect windows because the generic upgrade handler could close sockets before dynamic env handlers stabilized.
2. Sidebar first paint was still blocked by lanes/lane-component query dependencies even when workspace components were already available from the light workspace query.
3. Service-worker cache/controller isolation still needed stronger workspace-key partitioning to avoid cross-workspace/branch interference.
4. Apollo connection reporting via link mapping needed transport-safe handling for subscription/query flows.

### Implemented fixes

- `scopes/ui-foundation/ui/ui-server.ts`
  - Generic upgrade handler no longer force-closes `/_hmr/*` paths; dynamic component handlers can now take ownership.
  - Preserved close behavior for unrelated unknown upgrades to avoid noisy dangling sockets.
- `scopes/harmony/graphql/graphql.ui.runtime.tsx`
  - Replaced map-based reporter with a subscribe-based `Observable` reporter link to avoid runtime `forward(...).map` incompatibilities.
- `scopes/workspace/workspace/workspace.ui.drawer.tsx`
  - Sidebar now treats URL lane state as authoritative.
  - If no lane is in URL, lanes query is skipped and workspace components render immediately.
  - Lane/default lane component fetches are conditionally skipped until needed.
- `components/hooks/use-lanes/use-lanes.tsx`
  - Added `nextFetchPolicy: 'cache-first'` + `returnPartialData` for faster repeated renders and reduced query churn.
- `components/hooks/use-lane-components/use-lane-components.tsx`
  - Added `skip` option and cache-friendly fetch policy progression.
- `components/ui/component-drawer/component-drawer.tsx`
  - Drawer loading gate no longer hard-blocks on lanes model when component data is already available.
- `scopes/ui-foundation/ui/rspack/html.ts`
  - Added workspace-key-aware SW cleanup for mismatched registrations.
  - Expanded broken-SW migration detection for legacy `public/index.html` fallback variants.
- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`
- `scopes/ui-foundation/ui/rspack/rspack.browser.config.ts`
  - Added path-hashed `workspaceCacheKey` wiring to strengthen per-workspace SW/cache partitioning.
- `scopes/workspace/workspace/ui/workspace/workspace-overview/use-virtual-grid.ts`
  - Added strict runtime guard for `useVirtualizer` export shape to prevent non-function crashes.

### Validation

- Compile success:
  - `bit compile teambit.ui-foundation/ui teambit.harmony/graphql teambit.lanes/hooks/use-lanes teambit.lanes/hooks/use-lane-components teambit.component/ui/component-drawer teambit.workspace/workspace teambit.cloud/ui/user-bar teambit.component/graph`
- Smoke boot:
  - `__bd start --dev --no-browser --port 3101` reached "UI server ready" instantly.
  - Full browser-level HMR reconnect/offline-refresh verification still pending.

### Next focus

1. Measure query timings for workspace/lanes/component paths (baseline vs optimized).
2. Browser-verify HMR reconnection without hard refresh on preview server restarts.
3. Browser-verify offline refresh shell continuity and correct user-bar state transitions.

---

## Critical Query Checkpoint (2026-02-10, latest) — left sidebar blank-state + 20s startup query contention

### Reported regression

1. Left panel could show blank instead of loading while workspace query was still in-flight.
2. Startup queries were perceived as 20+ seconds again.

### Root cause

1. Sidebar workspace path returned `loading: false` while `workspace` was still `Workspace.empty()` (`name === ''`), so the drawer skipped its loader and rendered an empty tree.
2. `workspaceStatus` query is extremely expensive and was firing immediately after light query; timed API runs showed it can block other startup-critical queries for ~12-13s.
3. Drawer lanes path was still using a heavier lanes query shape than required for initial sidebar rendering.

### Implemented fixes

- `scopes/workspace/workspace/workspace.ui.drawer.tsx`
  - Added explicit workspace loading detection (`!workspace.name && workspaceComponents.length === 0`) so sidebar shows loader, not blank state.
  - Introduced dedicated minimal drawer lanes query (`WORKSPACE_DRAWER_LANES`) and switched drawer to it.
  - Kept lane component fetches conditional (skip when viewing workspace versions).
- `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
  - Deferred `WORKSPACE_STATUS` query by 3s after workspace light data arrives to remove startup contention with light/sidebar queries.

### GraphQL timing verification (live API, `http://localhost:3201/graphql`)

Sampled 3x each:

- `workspace_light`: min **327.2ms**, avg **561.3ms**, max **945.5ms**
- `workspace_status`: min **12565.2ms**, avg **16743.9ms**, max **24398.4ms**
- `lanes_legacy_heavy`: min **381.5ms**, avg **638.6ms**, max **1053.6ms**
- `lanes_drawer_minimal`: min **107.5ms**, avg **242.4ms**, max **356.6ms**

Contention probe:

- `lanesHeavyDuringStatus`: **13125.9ms**
- `lanesMinimalDuringStatus`: **159.7ms**
- `workspaceLightDuringStatus`: **12559.7ms**
- `workspaceLightSolo`: **209ms**

Interpretation:

- The startup bottleneck is status query contention.
- Deferring status + using minimal lanes query removes the 12-13s stalls from sidebar-critical query paths.

---

## Minimal Mode Optimization (2026-02-10) — skip status pipeline entirely

### Goal

- In workspace minimal mode, do not fire workspace status query at all.

### Implemented

- `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
  - Added `enableStatusQuery` option (default `true`).
  - When disabled: status readiness gate, idle arm, and chunked status fetch are fully bypassed.
  - `statusReady` resolves `true` in this mode, and `statusLoading` remains `false`.
- `scopes/workspace/workspace/ui/workspace/workspace.tsx`
  - Passes `enableStatusQuery: !isMinimal` to `useWorkspace(...)`.

### Validation

- `bit compile teambit.workspace/workspace` — success.

## Component Page Query + Version Logs Prefetch (2026-02-11)

### Problem addressed

1. Component route still used `useDataQuery` in critical component hooks, which can trigger global loader side effects and extra churn.
2. Component menu versions/logs were effectively eager on first render, but logs are only needed for version history menus.
3. If logs were deferred naively, version dropdown UX could become sluggish or disabled too early.

### Implemented

- `scopes/component/component/ui/use-component-query.ts`
  - switched `GET_COMPONENT` from `useDataQuery` to Apollo `useQuery`.
  - added `cache-and-network` + `nextFetchPolicy: 'cache-first'`.
  - logs are now opt-in: `useComponentLogs` only runs when `filters.log` is explicitly requested.
- `scopes/component/component/ui/use-component-logs.ts`
  - switched from `useDataQuery` to Apollo `useQuery` with cache-friendly policies.
- `scopes/component/component/ui/component.tsx`
  - removed implicit eager log request from default component path.
  - added explicit loading placeholder (`Loading component...`) instead of blank container while initial data is not ready.
- `scopes/component/component/ui/menu/menu.tsx`
  - added `fetchLogs` control to `UseComponentVersionsProps`.
  - `defaultLoadVersions()` now fetches logs only when `fetchLogs: true`.
  - initial menu render calls `useComponent({ initialLoad: true, fetchLogs: false })` to avoid eager logs.
  - corrected return field to `latest` (was incorrectly returned as `latestVersion`).
  - added `hasMoreVersions` as an optional/known-later signal (undefined until logs are fetched).
- `components/ui/version-dropdown/version-dropdown.tsx`
  - added intent-based prefetch (hover/focus/pointerdown/touch/open).
  - when intent is detected, calls `useComponentVersions({ fetchLogs: true })` in advance.
  - changed single-version lock from `!hasMoreVersions` to `hasMoreVersions === false`, so unknown state stays interactive.
- mirrored the same prefetch/unknown-state behavior in:
  - `components/ui/version-dropdown_1/version-dropdown.tsx`

### Compile validation

- `bit compile teambit.component/component ui/version-dropdown` — success.

### Runtime notes

- API timing probe (cold-ish run) observed large gap between component core vs logs:
  - component query cold: ~6.4s then warm <<1s,
  - component-logs query cold: ~17.6s.
- This confirms log fetch should stay deferred/prefetched on intent, not eager at page boot.

### Testing strategy artifact

- Sub-agent produced repo-specific validation matrix for startup/perf/offline/HMR/SW isolation and rollout gates.
- Plan should be used as the acceptance checklist for final sign-off before merge.

## Component Menu Versions Follow-up (2026-02-11, same session)

### Reported issue

- Version dropdown showed loading/empty state too often and did not clearly indicate more versions before logs were fetched.

### Root cause

1. `hasMoreVersions` stayed `undefined` until logs loaded, so indicator/affordance was weak.
2. Menu loading state could block content even when tag-version metadata was already available from component payload.

### Fixes

- `scopes/component/component/ui/menu/menu.tsx`
  - derive lightweight tag-version entries immediately from `component.tags` (no logs needed).
  - compute `hasMoreVersions` hint from available metadata before logs resolve.
  - keep logs lazy, but avoid full-block loading when menu already has usable tag data.
- `components/ui/version-dropdown/version-dropdown-placeholder.tsx`
- `components/ui/version-dropdown_1/version-dropdown-placeholder.tsx`
  - show dropdown arrow when `hasMoreVersions !== false` (unknown counts still show affordance).

### Validation

- `bit compile teambit.component/component ui/version-dropdown` — success.

## GraphQL Resolver Performance Checkpoint (2026-02-11, latest)

### Goal

- Reduce latency of startup-critical GraphQL paths with safe frontend + backend optimizations.

### Implemented backend optimizations

- `scopes/workspace/workspace/workspace.graphql.ts`
  - Added status-only field selection detection for `Workspace.components`.
  - Status-only component queries now call `ws.list(..., { loadExtensions: false, executeLoadSlot: false })`.
  - Added per-request status resolver cache:
    - memoizes computed status per component id,
    - computes auto-tag dependency set once per GraphQL request/workspace.
- `scopes/workspace/workspace/workspace-component/component-status-loader.ts`
  - Added fast path using `workspace.getLegacyMinimal(id)` before heavy `consumer.loadComponents(...)`.
  - Falls back to legacy path only when fast path is unavailable.
  - Result: status calculations avoid repeated heavyweight component loading for the common case.
- `scopes/lanes/lanes/lanes.graphql.ts`
  - Added per-request resolver caches for:
    - `laneComponentIds`,
    - `components`,
    - `readmeComponent`.
  - Avoids repeated lane resolver work within the same GraphQL operation.

### Implemented frontend optimization

- `scopes/component/component/ui/menu/menu.tsx`
  - Version dropdown data path now uses lightweight `GET_COMPONENT_VERSION_METADATA`
    (`id`, `packageName`, `latest`, `tags`, `buildStatus`) instead of full component query.
  - Logs remain lazy/prefetched on intent using `useComponentLogs`.
  - Keeps custom `useComponent` override path intact as fallback.

### Compile validation

- `bit compile teambit.workspace/workspace` — success.
- `bit compile teambit.lanes/lanes` — success.
- `bit compile teambit.component/component` — success.

### Live GraphQL timing (dev-server-test)

Before status-loader fast path (port 3001, same query shape):

- `workspaceStatus` (3 samples): **24.22s, 12.90s, 13.16s**

After status-loader fast path (port 3003, same query shape):

- `workspaceStatus` (3 samples): **10.28s, 9.18s, 9.04s**

Additional post-change samples:

- `workspaceLight`: **0.18s, 0.20s, 0.23s**
- `lanes`: **0.26s, 0.19s, 0.28s**

### Interpretation

- Major reduction in status-query latency (cold and warm) from ~13–24s down to ~9–10s.
- Light workspace and lanes queries remain sub-second and stable.
- Further backend gains will likely require deeper status algorithm changes (beyond resolver-level and minimal-load-path improvements).

### Expected impact

- Removes unnecessary backend/status pressure for minimal workspace UI.
- Avoids avoidable contention with startup-critical light/heavy queries in minimal mode.

---

## Runtime Hardening Checkpoint (2026-02-10, newest) — HMR proxy race + dev offline refresh + preview/grid throughput

### Root causes found

1. HMR proxy activation race:
   - `onDone` could mark env proxy active before `onComponentServerStarted`.
   - later `onComponentServerStarted` unconditionally marked it inactive again.
   - result: `_hmr/<env>` could stay permanently closed even after compile done.
2. Proxy path matching instability:
   - upgrade/request paths can contain URI-encoded env ids (`%40`), but matching was done on raw strings.
   - this can miss valid proxy entries and trigger socket closes / HPM noise.
3. Dev offline refresh gap:
   - dev config had SW disabled; refresh while server down could not recover app shell.
   - prior SW errors (`non-precached-url public/index.html`) were from stale/broken SW generations.
4. Preview throughput and scroll smoothness:
   - hydration queue was conservative (6) and only near-viewport.
   - in compatibility/fallback virtual-grid paths, layout spacing and remount behavior were still unstable.

### Implemented fixes

- `scopes/preview/preview/preview.start-plugin.tsx`

  - Proxy activation now follows compile truth (`isCompilationDone`) in `onComponentServerStarted`.
  - prevents permanent inactive `_hmr` state from startup ordering race.

- `scopes/ui-foundation/ui/ui-server.ts`

  - Added normalized/decode-safe proxy path matching (`normalizeProxyPath`).
  - applied normalization to upgrade routing and context matching.
  - reduces false negatives for encoded env ids and associated ws churn.

- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`

  - dev mode now registers SW (`serviceWorkerMode: 'register'`).
  - added middleware serving `/service-worker.js` with no-store headers.
  - removed noop SW middleware from dev path.

- `scopes/ui-foundation/ui/rspack/dev-service-worker.ts` (new)

  - lightweight dev SW for offline app-shell continuity.
  - workspace/build-token scoped cache names.
  - navigation network-first with cached-shell fallback.
  - asset cache fallback returns typed 503 (never HTML for JS/CSS) to prevent MIME/token-`<` failures.
  - excludes preview/hmr/graphql/api routes from SW interception.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/use-virtual-grid.ts`

  - added legacy `useVirtual` compatibility adapter.
  - modern+legacy hook selection is mutually exclusive.
  - non-supported path cleanly falls back without forcing unstable virtual mode.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`

  - retained-row machinery now runs only in true virtualized mode.
  - non-virtual mode avoids unnecessary retained index churn.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.module.scss`

  - added `.nonVirtualRow` with `content-visibility: auto` + intrinsic size for better large-list paint behavior.

- `scopes/preview/ui/preview-placeholder/preview-placeholder.tsx`
  - hydration queue made more aggressive (`HYDRATION_CONCURRENCY=16`).
  - first-wave eager auto-warm (`AUTO_WARM_PREVIEW_LIMIT=96`).
  - larger prewarm margin (`3200px`) to reduce scroll-in blanks.
  - added mount guard around queued hydration callbacks.

### Compile validation

- `bit compile teambit.ui-foundation/ui teambit.preview/preview teambit.preview/ui/preview-placeholder teambit.workspace/workspace` — success.
- repeated compile after virtual-grid hook-guard refinement:
  - `bit compile teambit.workspace/workspace` — success.

### Runtime smoke

- Ran:
  - `node /Users/luv/bit.dev/code/__bit/node_modules/@teambit/bit/dist/app.js start --dev --no-browser --port 3001`
  - in `/Users/luv/bit.dev/code/ws/dev-server-test`
- Observed:
  - UI server reached ready quickly.
  - no immediate startup crash in terminal logs.
  - long-running env compile spinner still present (expected under workspace load).

### Still pending browser sign-off

1. Confirm no `_hmr` websocket failure loops in DevTools after restart cycles.
2. Confirm refresh-while-offline in `--dev` restores shell + shows offline state (no blank).
3. Confirm no `non-precached-url` or JS-as-HTML MIME errors with new dev SW.
4. Confirm workspace overview spacing after virtualizer compat/non-virtual fallback in actual UI.

---

## Hotfix (2026-02-10) — Startup Auto-Refresh Loop Regression

### Symptom

- App kept auto-refreshing on startup in `__bd start --dev`.

### Root cause

- SW registration URL token in `html.ts` used `Date.now()` fallback when runtime hash could not be derived in dev.
- This produced a new SW URL every page load, repeatedly triggering controller changes and reload loops.

### Fix

- `scopes/ui-foundation/ui/rspack/html.ts`
  - removed `Date.now()` SW token fallback path.
  - added explicit injected `serviceWorkerBuildToken`.
  - added `autoReloadOnSwControllerChange` switch.
- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`
  - sets stable dev SW token to `workspaceCacheKey`.
  - disables controller-change auto-reload in dev.

### Validation

- `bit compile teambit.ui-foundation/ui` — success.

## Hotfix (2026-02-10, follow-up) — `res.status is not a function` + reconnect reload loop

### Reported regression

- `__bd start --dev` logged repeated `TypeError: res.status is not a function` from `@teambit/ui/dist/ui-server.js`.
- Browser kept reloading.

### Root cause

1. Some proxy/error paths in `ui-server` assumed Express response helpers (`res.status()`, `res.send()`), but occasionally received a plain Node response object in runtime path.
2. Workspace overview had an offline->online auto-reload path that could loop under noisy reconnect transitions during startup.

### Fixes

- `scopes/ui-foundation/ui/ui-server.ts`
  - Added transport-safe response helpers (`setResponseStatus`, `sendResponse`, `sendPreviewOfflineScript`).
  - Replaced direct `res.status(...).send(...)` usage in proxy/fallback handlers.
- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`
  - Removed forced `window.location.reload()` reconnect behavior to eliminate reload loops.

### Validation

- `bit compile teambit.ui-foundation/ui teambit.workspace/workspace` — success.
- bounded startup log capture no longer showed `TypeError: res.status is not a function`.

## Dev-Mode Policy Hardening (2026-02-10) — Fresh state on each rerun

### Requirement captured

- In `start --dev`, each fresh run should start from clean browser SW/cache state.
- Within the same run, normal refresh should still benefit from SW/cache behavior.

### Implemented behavior

- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`
  - injects per-run `devSessionToken` (`workspaceCacheKey + startup timestamp`).
  - enables `serviceWorkerDevSessionReset: true`.
- `scopes/ui-foundation/ui/rspack/html.ts`
  - on dev-session token change, clears SW registrations + caches once, then stores token in localStorage.
  - subsequent refreshes in same run reuse cache/SW normally.
  - retains disabled controller-change auto-reload in dev to prevent loops.

### Validation

- `bit compile teambit.ui-foundation/ui` — success.
- bounded `__bd start --dev` logs: no `res.status is not a function` crash signature.

## Apollo Cache Consistency Hardening (2026-02-10)

### Problem addressed

- Fast boot from persisted Apollo cache is good, but if startup network sync fails and subscriptions are unavailable, cached component lists could remain stale.
- Example: cache contains 10 components while workspace reality has 20.

### Fix implemented

- `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
  - `WORKSPACE` query now uses `errorPolicy: 'all'` to keep cached render while exposing network failure state.
  - Added background recovery refetch loop **only when network error exists**.
  - Added immediate recovery refetch on browser/network reconnect signals.
  - Retry backoff is bounded (1.2s → max 10s) and stops once network succeeds.

### Why this keeps performance

- Fast path unchanged: cache renders instantly (`cache-and-network`) and normal startup does not add extra polling.
- Recovery loop activates only in failure mode; no added steady-state overhead.

### Validation

- `bit compile teambit.workspace/workspace` — success.

## UX Stability Checkpoint (2026-02-11) — User-bar status flapping + preview loading skeleton + grid row spacing

### Reported issues

1. User-bar status indicator was oscillating `offline -> online -> offline -> online` during startup/reconnect windows.
2. Preview surfaces (component overview/compositions) were showing blank iframe areas while bundles were still loading.
3. Workspace overview virtual rows showed inconsistent header-to-grid spacing and occasional over-gap/overlap in grouped sections.

### Root causes

1. Connectivity hook transitioned to offline too eagerly on transient network errors (including websocket churn) without debounced local health verification.
2. `ComponentPreview` had no built-in visual loading shell before iframe readiness signals.
3. Retained virtual rows fell back to static estimated offsets instead of last measured starts, causing visible layout drift when rows were retained off-screen.

### Implemented fixes

- `scopes/cloud/ui/user-bar/use-dev-server-connection-status.ts`

  - added debounced offline transition (`OFFLINE_DEBOUNCE_MS`) for network-origin signals.
  - added local `/graphql` ping verification before committing offline state.
  - kept browser-level offline immediate, but suppresses transient startup flaps.
  - clears pending offline transitions as soon as online/recovering signals stabilize.

- `scopes/preview/ui/component-preview/preview.tsx`

  - added `isPreviewReady` gate and URL-reset behavior.
  - LOAD_EVENT / preview-size now promote readiness; webpack invalidations drop back to loading.
  - added fallback iframe `onLoad` readiness handling.
  - error events now reveal iframe instead of leaving a loading shell over error output.

- `scopes/preview/ui/component-preview/preview.module.scss`

  - added reusable shimmer loading shell (`.loadingPlaceholder`, `.loadingShimmer`, `.loadingBar`) for iframe boot.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`

  - retained virtual rows now cache and reuse last measured `start` positions.
  - resets retained start cache when aggregation/filter semantics change.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.module.scss`
  - tuned header block spacing (`.virtualGroupHeader*`, `.aggregationTitle`) for cleaner header-to-grid rhythm.

### Validation

- `bit compile teambit.cloud/ui/user-bar teambit.preview/ui/component-preview teambit.workspace/workspace` — success.

### Pending browser sign-off

1. Confirm user-bar no longer flaps during `__bd start --dev` startup/reconnect cycles.
2. Confirm preview shimmer appears consistently in workspace overview + component overview + compositions until iframe ready.
3. Confirm grouped workspace spacing looks correct across long lists and after scroll/virtualization retention.

## Runtime UX Stabilization Checkpoint (2026-02-11) — ResizeObserver root fix + stable user-bar state + shared preview skeleton

### What was fixed

1. **Permanent ResizeObserver error fix (no suppression)**

- File: `scopes/workspace/workspace/ui/workspace/workspace-overview/use-virtual-grid.ts`
  - Removed global `window.onerror` suppression for `ResizeObserver loop` warnings.
  - Removed modern virtualizer row `measureElement` path (fixed-size rows no longer trigger layout re-measure loops).
  - Stabilized container `ResizeObserver` updates through `requestAnimationFrame` and only updates columns when value actually changes.
- File: `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`
  - Removed per-row `ref={virtualizer.measureElement}` in virtualized render path to avoid observer-driven reflow loops.

2. **User-bar online/offline state flapping hardening**

- File: `scopes/cloud/ui/user-bar/use-dev-server-connection-status.ts`
  - Added debounced offline transition + explicit local health verification before committing offline.
  - Added short offline-guard window after recovery to avoid `offline -> online -> offline` oscillation during startup reconnect bursts.
  - Kept dev/preview semantics split: preview signals no longer mark main UI offline.
  - Indicator now supports persistent online state (`Online`, `Reconnecting`, `Previews loading`, `Previews offline`, `Offline`).
- Files: `scopes/cloud/ui/user-bar/user-bar.tsx`, `scopes/cloud/ui/user-bar/user-bar.module.scss`
  - Added `online` indicator tone/style and wired class mapping.

3. **Preview loading skeleton reuse across surfaces**

- File: `scopes/preview/ui/component-preview/preview.tsx`
  - Added iframe readiness state and skeleton overlay shown while preview bundle/iframe is loading.
  - Skeleton hides once load signal or iframe onLoad arrives.
- File: `scopes/preview/ui/component-preview/preview.module.scss`
  - Added shared shimmer skeleton styles.
- Effect: this is now reused by compositions and component preview surfaces because they render through `ComponentPreview`/`ComponentComposition`.

### Validation

- Compiles:
  - `bit compile teambit.workspace/workspace teambit.cloud/ui/user-bar`
  - `bit compile teambit.cloud/ui/user-bar teambit.preview/ui/component-preview teambit.workspace/workspace`
- Result: successful compile for all touched aspects.

### Notes

- ResizeObserver issue is fixed by removing the problematic re-measure path; no runtime suppression/masking remains.
- Browser-level verification is still required to sign off exact UX transitions under live `__bd start --dev` restart/kill cycles.

## Sidebar First-Paint Jitter Hotfix (2026-02-11)

### Symptom

- Left sidebar tree looked janky on initial render (visible post-mount jitter).

### Root cause

- `ComponentView` in sidebar tree was forcing a second render for every node via local `mounted` state (`false -> true` in `useEffect`).
- On larger trees this produced an avoidable second render wave right after first paint, making initial sidebar rendering appear to jitter.

### Fix implemented

- File: `components/ui/side-bar/component-tree/component-view/component-view.tsx`
  - Removed per-node `mounted` state and mount effect.
  - Replaced with SSR-safe derived flags (`hasWindow`, `locationOrigin`, `isLocalhost`) without state changes.
  - Preserved URL generation behavior for lane/main env links with no post-mount state flip.

### Compile validation

- `bit compile teambit.ui-foundation/ui/side-bar` — success.

### Runtime note

- Dist verification confirms `mounted`/`setMounted` no longer present in `@teambit/ui-foundation.ui.side-bar` built output.

## Workspace Overview UX Refresh (2026-02-11) — Loading/Offline shell redesign

### Goal

- Improve dev-server loading/offline experience in workspace overview so startup and reconnect states are visually stable and clear.

### Implemented

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`
  - Replaced basic loading/offline shells with a dedicated boot-state UI:
    - status pill (`Connecting` / `Offline`)
    - explicit title/description for loading vs offline causes
    - `Retry now` action (health probe against `/graphql`)
    - non-blank skeleton card grid while waiting
  - Added lightweight connection reason handling (`network` vs `browser-offline`) for better offline messaging.
- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.module.scss`
  - Added full boot-shell design system styles + shimmer skeleton grid + responsive breakpoints.

### Validation

- `bit compile teambit.workspace/workspace` — success.
- linked to test workspace via `__bd link` in `/Users/luv/bit.dev/code/ws/dev-server-test`.

### Notes

- This is a UX-only shell redesign; query orchestration remains unchanged.
- The shell now avoids blank/abrupt transitions while preserving instant app startup behavior.

## No-Blank UX Hardening + Overview Gap Pass (2026-02-11)

### User requirement

- Ensure proper workspace overview gaps.
- Ensure no blank states when dev server goes offline (workspace overview + component page + previews).

### Implemented fixes

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`

  - Fixed first-paint virtualized blank risk by introducing `rowIndexesToRender` fallback order:
    1. retained rows
    2. live virtual rows
    3. first N estimated rows
  - This removes the transient empty render when retained indexes are not yet populated.

- `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.module.scss`

  - Gap tuning pass for overview rhythm:
    - filter panel bottom spacing increased
    - group header padding adjusted
    - card row gaps made explicit via `row-gap` + `column-gap`
    - aggregation title spacing tightened

- `scopes/component/component/ui/component.tsx`

  - Replaced plain loading text with non-blank component boot shell + shimmer bars.
  - For non-404 runtime errors, replaced abrupt server error page path with graceful "temporarily unavailable" shell + retry action.

- `scopes/component/component/ui/component.module.scss`

  - Added styles for component boot shell, retry action, and shimmer placeholders.

- `scopes/preview/ui/component-preview/preview.tsx`

  - Enhanced preview loading placeholder with slow-load message escalation:
    - initial: "Loading preview..."
    - delayed: "Preview is waiting for the dev server."
  - Keeps preview container visibly occupied while iframe is unavailable.

- `scopes/preview/ui/component-preview/preview.module.scss`
  - Added loading caption styles for the preview placeholder.

### Validation

- `bit compile teambit.workspace/workspace teambit.component/component teambit.preview/ui/component-preview` — success.
- linked to `/Users/luv/bit.dev/code/ws/dev-server-test` via `__bd link`.

### Remaining sign-off

- Browser verification needed under `__bd start --dev` with kill/restart cycles to confirm there are no blank frames in all targeted surfaces.

---

## Runtime Stability Checkpoint (2026-02-11, reload-loop + ResizeObserver)

### Trigger

- User reported persistent browser auto-reload behavior and recurring ResizeObserver errors during preview rendering.

### Root causes addressed

1. Service-worker bootstrap still allowed controller-change reload behavior in dev flows under stale controller transitions.
2. Preview size reporter mutated observed DOM styles inside ResizeObserver measurement (`root.style.height = 'auto'`), a classic source of ResizeObserver loop warnings.

### Implemented fixes

- `scopes/ui-foundation/ui/rspack/html.ts`
  - Removed hard reload behavior from SW cleanup/controller-change paths.
  - Kept controller-change as non-disruptive informational event only.
- `scopes/preview/preview/preview.preview.runtime.tsx`
  - Replaced mutating height measurement with non-mutating scroll/rect aggregate measurement.
  - Added explicit cleanup for prior observer/debounce/raf cycle before re-registering observer.
  - Kept debounced + RAF scheduling to avoid resize storm feedback.

### Validation executed

- `bit compile teambit.ui-foundation/ui` ✅
- `bit compile teambit.preview/preview` ✅
- `__bd link` in `ws/dev-server-test` ✅

### Remaining sign-off

- Interactive browser verification still required to confirm:
  - no auto page reload loop,
  - no ResizeObserver loop errors in console,
  - smooth preview skeleton-to-ready transitions.

---

## Reload-loop guard checkpoint (2026-02-11)

Issue: workspace page reported repeated self-refresh in `__bd start --dev` sessions.

Root-cause hardening applied:

- `scopes/react/react/webpack/overlay/webpackHotDevClient.js`
  - introduced `safeReload()` and `shouldAutoReload()` guards.
  - top-level workspace pages now skip forced reloads by default.
  - forced reloads are throttled (`15s`) even when allowed.
- `scopes/ui-foundation/ui/rspack/html.ts`
  - added `window.__BIT_DISABLE_DEV_AUTO_RELOAD__ = true` in workspace shell bootstrap.

Validation:

- `bit compile teambit.react/react teambit.ui-foundation/ui` ✅
- `__bd link` in `dev-server-test` ✅

Notes:

- This preserves iframe-level recovery behavior while preventing full-page reload loops in the main workspace UI.
- Browser-level confirmation still required on your repro flow.

---

## Status source-of-truth reversion (2026-02-11)

Per request, status loader and resolver logic were realigned to canonical status semantics:

- `scopes/workspace/workspace/workspace-component/component-status-loader.ts`
  - removed `workspace.getLegacyMinimal()` fast path from `getStatus()`.
  - restored legacy `consumer.loadComponents(...LATEST)` status-load path.
- `scopes/workspace/workspace/workspace.graphql.ts`
  - `Component.status` resolver now returns `wsComponent.getStatus()` directly.
  - removed resolver-level status reconstruction/cache path that bypassed `WorkspaceComponent#getStatus`.

Validation:

- `bit compile teambit.workspace/workspace` ✅
- relinked optimized workspace via `__bd link` in `/Users/luv/bit.dev/code/ws/dev-server-test` ✅

---

## Dev profile reload-loop cache hardening (2026-02-11)

Symptom:

- Browser profile (non-incognito) on `localhost:3000` could keep refreshing while incognito did not.

Root cause (probable):

- stale mutable dev assets (`/static/js|css`) being reused via SW/browser cache in normal profile.

Fixes:

- `scopes/ui-foundation/ui/rspack/dev-service-worker.ts`
  - changed asset strategy from cache-first to network-first (`fetch(..., { cache: 'no-store' })`) with cache fallback only on fetch failure.
  - excluded `hot-update.(js|json)` from SW interception/caching.
- `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`
  - set `Cache-Control: no-store, no-cache, must-revalidate` for mutable `/static/js/*` and `/static/css/*` assets in dev server middleware.
  - kept short caching only for static binary assets (images/fonts).

Validation:

- `bit compile teambit.ui-foundation/ui` ✅
- relinked workspace (`__bd link`) ✅
- dist verification confirms updated SW + dev cache headers.

---

## Preview status transition hardening checkpoint (2026-02-17)

### Trigger

- Critical regressions remained in preview status semantics:
  - user bar could show `Online` first then get stuck in `Previews loading` after refresh,
  - preview compile -> ready transition could remain stale until route navigation or hard refresh.

### Root causes fixed

1. Mixed preview signal sources were fighting each other:
   - workspace snapshot (expected/ready keys) and per-iframe online/offline events could diverge,
   - keyed iframe events could keep preview state in loading even after servers were ready.
2. `componentServerStarted` subscription consumer in workspace assumed an array-only payload shape.
3. If preview server-start subscription messages were missed during startup race windows, readiness state could stay stale.

### Implemented (P1/P2/P3)

- **P1: Snapshot-authoritative preview status flow**

  - `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
    - emits only `previewSnapshot` (presenceKeys + readyKeys), no per-key delta/online events,
    - persists latest snapshot on `window.__BIT_PREVIEW_STATUS__` for late listener hydration,
    - adds reconcile polling (`refetch`) while expected previews > ready previews,
    - hardens `componentServerStarted` parsing for array/object payload shape.
  - `scopes/cloud/ui/user-bar/use-dev-server-connection-status.ts`
    - consumes `previewSnapshot` as authoritative source,
    - ignores keyed iframe online/offline signals to avoid stale loading loops,
    - hydrates from `window.__BIT_PREVIEW_STATUS__` on mount.

- **P2: Remove legacy duplicate compile-event listener**

  - `scopes/preview/preview/preview.start-plugin.tsx`
    - removed deprecated `SubscribeToWebpackEvents` wiring;
    - `SubscribeToEvents` remains the single compile event source.

- **P3: Simplify iframe navigation scheduling**
  - `scopes/preview/ui/component-preview/preview.tsx`
    - removed extra `setTimeout(0)` layer; navigation scheduling now uses `requestAnimationFrame` only.

### Validation

- `bit compile teambit.workspace/workspace teambit.cloud/ui/user-bar teambit.preview/preview teambit.preview/ui/component-preview` ✅
- linked workspace via `node /Users/luv/bit.dev/code/__bit/node_modules/@teambit/bit/dist/app.js link` in `ws/dev-server-test` ✅
- `start --dev` smoke run on port `3060` shows expected startup flow and preview compile progression (manual browser transition verification still required).

### Notes

- Existing unrelated modified files from earlier iterations remain in working tree.
- This checkpoint focuses only on status-transition root-cause hardening + P1/P2/P3 simplification.

---

## Rspack-accurate preview compilation state checkpoint (2026-02-17)

### Goal

Make user-bar preview status reflect real preview dev-server compile lifecycle (not only iframe readiness) and keep transitions smooth (`offline -> loading -> online`).

### Implemented

- Added backend GraphQL subscription for compile lifecycle state:
  - `componentServerCompilationChanged` in bundler schema.
  - files:
    - `scopes/compilation/bundler/events/components-server-started-event.ts`
    - `scopes/compilation/bundler/dev-server.graphql.ts`
- Preview start plugin now publishes compile-state events from real compiler hooks:
  - `onStart` -> `isCompiling: true`
  - `onDone` -> `isCompiling: false` + warning/error counts
  - file: `scopes/preview/preview/preview.start-plugin.tsx`
- Workspace UI now subscribes to compile-state events and includes compiler truth in preview snapshots:
  - tracks per-env compile state,
  - emits snapshot `{ presenceKeys, readyKeys, compilingKeys }` to `bit-dev-server-connection-status`.
  - file: `scopes/workspace/workspace/ui/workspace/use-workspace.ts`
- User-bar connection-state hook now consumes `compilingKeys` and uses it as loading authority:
  - if any compiling keys exist -> `Previews loading`,
  - waits for short online settle window to avoid visual flap,
  - boot flow avoids initial online->loading flicker by waiting for first snapshot (with timeout fallback).
  - file: `scopes/cloud/ui/user-bar/use-dev-server-connection-status.ts`

### Validation

- `bit compile teambit.compilation/bundler teambit.preview/preview teambit.workspace/workspace teambit.cloud/ui/user-bar` ✅
- `node .../bit/dist/app.js link` in `ws/dev-server-test` ✅
- GraphQL schema probe confirms subscription availability:
  - `componentServerStarted`
  - `componentServerCompilationChanged`
- startup smoke on `start --dev --port 3061` ✅

### Notes

- This checkpoint keeps the existing snapshot-authoritative model and upgrades it with compile-truth from actual rspack lifecycle events.
- Full browser UX sign-off still needed for final transition polish judgment.

### Compile-status root-cause mapping fix (2026-02-17, follow-up)

- Root cause: preview compile events are emitted with runtime env IDs (e.g. `teambit.envs/env`, `bitdev.general/envs/bit-env@3.0.6`) that do not directly match component `env.id` values used by workspace cards/user-bar readiness logic.
- Resulting regression:
  - user-bar could report `Online` while preview servers were still compiling,
  - cards could stay in loading because readiness/compile mapping was inconsistent.

Fix:

- `componentServerCompilationChanged` payload now includes `affectedEnvs` (context id + related contexts) so compile state can be mapped to component env IDs accurately.
- Workspace compile map now updates all `affectedEnvs` and computes ready preview keys as `server.url && !isCompiling`.
- Prevented pre-data empty snapshot emission (`useWorkspace` now skips snapshot dispatch until `workspace` exists).

Files:

- `scopes/compilation/bundler/dev-server.graphql.ts`
- `scopes/preview/preview/preview.start-plugin.tsx`
- `scopes/workspace/workspace/ui/workspace/use-workspace.ts`

Validation:

- `bit compile teambit.compilation/bundler teambit.preview/preview teambit.workspace/workspace` ✅
- relinked workspace via `node .../bit/dist/app.js link` in `ws/dev-server-test` ✅
