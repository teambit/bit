# Rspack Migration — Scope (Updated)

Last updated: 2026-02-11

## Branch Context

- Runtime branch (`perf/runtime-optimizations`) has already merged latest master.
- Master includes rspack migration commit:
  - `225881d03` — `feat(workspace | preview): migrate from webpack to rspack (#10187)`
- Runtime branch merge commit:
  - `7b9a59e0f` — `Merge master into runtime optimizations and port UI start path to rspack`

This document now tracks remaining rspack-related hardening and perf follow-ups, not initial migration bootstrap.

---

## Goal

Maintain instant UI startup and runtime correctness on rspack while continuing compile-time improvements.

---

## Already Landed (High-level)

1. UI server + preview stack migrated to rspack in master.
2. Runtime branch merged master and resolved config/path conflicts.
3. Rspack dev config now includes fallback guards to avoid serving HTML for JS/hot/HMR asset requests.
4. Service worker handling was adjusted for safer navigation caching strategy and workspace cache partitioning.

---

## Current Remaining Scope

### 1) Offline reliability (highest priority)

- Refreshing after dev-server kill must render cached shell and explicit offline state.
- No blank page states.
- Recovery on restart should not require manual hard refresh.

### 2) Connection-state semantics

- Main server connectivity and preview-server availability must remain distinct.
- User bar should show:
  - offline (main server down),
  - previews loading,
  - previews offline,
  - online recovery.

### 3) SW/cache isolation across branches/workspaces

- Running multiple Bit instances must not cross-pollute service worker caches or app-shell state.
- Verify per-workspace cache IDs and SW update behavior in parallel runs.

### 4) MIME/fallback correctness

- Guarantee no JS bundle URL is rewritten to HTML.
- Prevent `Unexpected token '<'` class regressions for runtime/main/chunk/hot-update requests.

### 5) Watcher stability (`EMFILE`)

- Investigate and mitigate excessive watcher FD usage under `--dev`.

---

## Latest Rspack Follow-up Progress (2026-02-10)

Completed in this checkpoint:

1. Added decode-safe proxy path matching in `scopes/ui-foundation/ui/ui-server.ts` to improve encoded env-id route matching for `/_hmr/*` and preview proxy paths.
2. Added HMR activation race fix in `scopes/preview/preview/preview.start-plugin.tsx` so env proxy active state reflects actual compilation state.
3. Enabled dev-mode service worker registration in `scopes/ui-foundation/ui/rspack/rspack.dev.config.ts`.
4. Added `scopes/ui-foundation/ui/rspack/dev-service-worker.ts`:
   - workspace/build-token scoped caches,
   - navigation fallback for offline refresh in dev,
   - typed 503 for missing cached assets (prevents HTML-as-JS MIME regressions),
   - excludes preview/hmr/graphql/api from SW fetch interception.

Compile verification:

- `bit compile teambit.ui-foundation/ui teambit.preview/preview` — success.

Remaining verification:

- Browser prove offline-refresh in `--dev` works reliably after killing/restarting dev server.
- Browser verify no `non-precached-url` and no HMR websocket churn loops during restart windows.

---

## Validation Protocol

Run from optimized workspace:

```bash
cd /Users/luv/bit.dev/code/ws/dev-server-test
__bd start --dev
```

Must verify in browser:

1. UI appears quickly even while previews compile.
2. Killing dev server + refresh still shows app shell and offline state.
3. Restarting dev server recovers UI state without mandatory hard refresh.
4. No service-worker console errors (`non-precached-url`).
5. No JS MIME type errors caused by HTML fallback.
6. Preview cards/compositions load when preview servers become ready.

---

## Notes

- Keep runtime acceptance criteria in `.agent/scale/40-runtime-acceptance.md` as source of truth.
- Do not claim additional perf wins without baseline-vs-optimized measurement updates in `.agent/bench/results.csv`.

---

## Follow-up (2026-02-11) — Component route/query optimization on merged rspack stack

Although core rspack migration is complete, runtime follow-up landed on this branch:

1. Component route data hooks (`use-component-query`, `use-component-logs`) now use Apollo `useQuery` with cache-friendly policies (no `useDataQuery` in this path).
2. Version/log data fetch for component menu is now lazy-by-default and intent-prefetched (hover/focus/open), rather than eager at boot.
3. Version dropdown no longer disables itself while version-count is unknown; it stays interactive and hydrates quickly after intent prefetch.

Compile check:

- `bit compile teambit.component/component ui/version-dropdown` — success.

## Runtime Follow-up (2026-02-11, resolver performance)

Applied non-migration runtime performance improvements on merged rspack stack:

1. Workspace status resolver path optimized with status-only selection handling and status-request cache.
2. Component status loader now uses `getLegacyMinimal()` fast path before heavy fallback.
3. Lanes GraphQL resolvers now use per-request memoization for lane component ids/models/readme.
4. Component menu version path moved to lightweight metadata query; logs remain lazy + intent-prefetched.

Measured result (dev-server-test):

- `workspaceStatus` dropped from ~13–24s to ~9–10s.
