# AGENTS.md — Bit Dev Server Performance Optimization

> Universal agent instructions for AI coding assistants working on this codebase.
> For detailed working context, see `.agent/context.md`.

---

## Project Overview

Bit is built using Bit itself (dogfooding). The codebase is component-based: aspects, scopes, environments, capsules. Always use `bit` commands over direct npm/pnpm.

Two active performance workstreams on separate branches:

1. **Runtime Optimizations** (`perf/runtime-optimizations`) — ~100x faster UI, instant workspace
2. **Rspack Migration** (`perf/rspack-migration`) — migrated and merged via `master` (follow-up hardening only)

---

## Development Commands

```bash
# Setup
npm run full-setup           # Complete repository setup
bit install                  # Install deps (NEVER run pnpm install directly)

# Build
bit compile                  # Compile all components
bit compile <aspect-id>      # Compile specific aspect (REQUIRED after source changes)
bit watch                    # Watch + auto-compile

# Test
bit test                     # Unit tests
npm run e2e-test             # E2E tests (ALWAYS add .only first — full suite takes hours)

# Lint
npm run lint                 # ESLint + type checking
npm run format               # Prettier

# Dev server
bit start                    # Start Bit UI for component development
bit start --dev              # Start with dev servers for preview
```

---

## Architecture

### Key Directories

- `scopes/` — All aspects organized by domain (harmony, component, workspace, etc.)
- `components/` — Standalone components and utilities
- `e2e/` — End-to-end tests

### Aspect Structure

Each aspect follows: `.aspect.ts` → `.main.runtime.ts` → `.ui.runtime.ts` → `.docs.mdx` → `.composition.tsx`

### Bootstrap Flow

1. User runs Bit command
2. Bit builds graph of core + workspace aspects
3. Aspects loaded, instantiated, register CLI commands
4. Command parsed and executed

### Runtime Architecture

- Source lives in `__bit/scopes/*/` — changes here require `bit compile <aspect>`
- Runtime loads from `node_modules/@teambit/*/dist/` NOT from source
- New exports must be added to aspect's `index.ts` before available
- Workspace UI runs React 17 (`react-dom@17.0.2`) — React 18 APIs unavailable

---

## Execution Protocol (Mandatory)

Before doing implementation work, agents MUST read and follow:

- `.agent/protocol/PROTOCOL.md` (Ralph Wiggum loop)
- `.agent/protocol/STATE.json` (current experiment state)

The Wiggum loop is mandatory:

1. Restate goal + constraints
2. Pick one smallest next task
3. Implement minimal diff
4. Measure baseline vs optimized
5. Validate runtime acceptance
6. Update STATE
7. Keep/revert based on evidence

---

## Performance Work — Current State

### Workstream 1: Runtime Optimizations (Branch: `perf/runtime-optimizations`)

**Status**: Active stabilization on merged rspack stack (`master` merged into this branch)

Shipped foundations:

- Three-query progressive loading: light ~120ms → heavy ~78ms → status ~13s deferred
- Apollo batching disabled (fast queries not blocked by slow ones)
- Hooks migrated from `useDataQuery` → `useQuery` (no global loader on lanes/cloud)
- UI-start decoupling improvements + proxy/fallback hardening + env icon fixes
- Preview stability work (remount reduction, compositions/query ordering improvements)

Current focus:

1. offline refresh resilience (no blank app on refresh when server is down)
2. main-vs-preview status correctness in user bar
3. SW/cache isolation across multiple branches/workspaces
4. spacing/z-index and runtime stability polish (`EMFILE` pressure included)
5. hyper-optimize sidebar/workspace/lanes/component query path (no visible left-panel loading)
6. eliminate HMR websocket disconnect loops at proxy root-cause level

### Workstream 2: Rspack Migration (Branch: `perf/rspack-migration`)

**Status**: Core migration merged from `master` into `perf/runtime-optimizations`

Done: UI/preview rspack migration merged from `master` (commit `225881d03`) and merged into this branch (commit `7b9a59e0f`).
Remaining: follow-up runtime hardening and perf verification on merged rspack path (see `.agent/rspack-migration-scope.md`).

---

## Repo + Workspaces

| Purpose             | Path                                          | Run with        |
| ------------------- | --------------------------------------------- | --------------- |
| Core Bit repo       | `/Users/luv/bit.dev/code/__bit`               | `bit compile`   |
| Optimized workspace | `/Users/luv/bit.dev/code/ws/dev-server-test`  | `__bd start`    |
| Baseline workspace  | `/Users/luv/bit.dev/code/ws/dev-server-test2` | BVM `bit start` |

`__bd` = `node /Users/luv/bit.dev/code/__bit/node_modules/@teambit/bit/dist/app.js`

---

## Non-Negotiable Rules

### Constraints

- NO hardcoded package names/lists for shared deps, externals, or bundles
- Dependency discovery MUST come from Bit APIs/models
- Do NOT disable source maps globally
- Do NOT use `devtool: 'eval'`
- Do NOT accept runtime regressions to improve boot
- ALWAYS compile after source changes (`bit compile <aspect>`)
- ALWAYS verify in browser before reporting as done
- NEVER claim perf wins without actual measurement vs baseline

### Measurement Protocol

Every claimed improvement must be backed by:

- **Baseline**: `dev-server-test2` with BVM `bit` (clear `node_modules/.cache/webpack-dev/`)
- **Optimized**: `dev-server-test` with `__bd` (clear webpack + rspack caches)

### Runtime Acceptance Checklist

Before accepting perf changes:

- Workspace page loads, shows component cards
- Global loader dismisses in <500ms (target: <200ms)
- Env icons render after heavy query resolves
- Preview iframe loads, compositions render, no console errors
- HMR works (edit source → preview updates)
- Source maps work for component-authored files
- Navigation between components works

---

## Lessons Learned (hard-earned)

1. `useDataQuery` = `useQuery` + `useLoader(loading)` — triggers global `LoaderRibbon`
2. Apollo BatchHttpLink blocks ALL queries until slowest completes
3. `queueMicrotask` timing bug: cleanup runs BEFORE promise continuations
4. Per David First: status slowness is from loading components, not checking status
5. Runtime loads from `node_modules/@teambit/*/dist/` NOT from source
6. `cache-and-network` as global fetch policy applies to ALL queries — use per-query
7. `nextFetchPolicy: 'cache-first'` settles after initial fetch, prevents storms
8. Plugin memo deps must NOT include frequently-changing data — use refs for closures
9. Creating wrapper function components in useMemo destroys iframe identity in React
10. `ComponentCard` only passes `component` to preview plugin, NOT `shouldShowPreview`
11. `ComponentComposition` uses `composition?.identifier` in memo deps, not full object
12. WDS proxy entries are STATIC — set at creation time, `getProxy()` after `initiate()`
13. React 17 — `startTransition` unavailable, workspace runs `react-dom@17.0.2`
14. HtmlRspackPlugin strips inline scripts — use external `<script src>` tags
15. Express middleware: `unshift()` for priority over `historyApiFallback`

---

## Approaches Evaluated and Rejected

| Approach                             | Why Rejected                                                |
| ------------------------------------ | ----------------------------------------------------------- |
| Webpack lazy compilation             | Defers 57s compile to first preview load — worse total time |
| EsbuildDevServer                     | Can't handle full preview dep graph (CSS, Node.js builtins) |
| Host deps prebundling only           | ~5% improvement — marginal                                  |
| Expanded externals via template deps | Runtime errors — module resolution breaks                   |
| queueMicrotask batch cache           | Timing bug — cleanup before continuations                   |
| pMap parallelization of status       | Per David: slow part is loading components                  |
| Global cache-and-network             | Applied to ALL queries causing refetch storm                |
| startTransition for filters          | React 17 incompatible                                       |
| compModelsById as memo dep           | 212x iframe destruction storm per data change               |
| PreviewWrapper in useMemo            | New function component per render → iframe remount          |

---

## Agent Working Context

Detailed working documents live in `.agent/`:

- `.agent/context.md` — Source of truth for both workstreams (full change log)
- `.agent/rspack-migration-scope.md` — Rspack scope, phases, files, commands
- `.agent/scale/` — Goals, constraints, measurement, acceptance, experiment rules
- `.agent/protocol/` — Execution model, state tracking
- `.agent/bench/` — Benchmark results

First read order for every agent session:

1. `.agent/context.md`
2. `.agent/protocol/PROTOCOL.md`
3. `.agent/protocol/STATE.json`

---

## Troubleshooting

| Problem                                | Fix                                                        |
| -------------------------------------- | ---------------------------------------------------------- |
| `Cannot find module '../dist/app'`     | `cd __bit && bit compile`                                  |
| dev-server-test not picking up changes | `__bd link && __bd compile`                                |
| New exports not found                  | Add to aspect's `index.ts`, then `bit compile <aspect-id>` |
| GQL changes don't take effect          | `bit compile <aspect-id>`, verify dist matches source      |
