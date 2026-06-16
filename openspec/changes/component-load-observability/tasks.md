## 1. Trace context + spans (PR 1)

- [x] 1.1 Create `LoadTraceContext` module (AsyncLocalStorage-based): `runWithLoadTrace(meta, fn)`, `currentLoadTrace()`, `trace.span(name, attrs, fn)` recording start/duration/attributes into an in-memory span tree
- [x] 1.2 Add logger integration: prefix helper so `logger.*` calls inside an active trace emit `[trace:<id> <path>]`; emit closed spans at `trace` log level
- [x] 1.3 Wrap top-level entry points to start-or-join a trace: `WorkspaceComponentLoader.get/getMany`, `WorkspaceAspectsLoader.loadAspects`, `ScopeComponentLoader.get/getMany`; replace the ad-hoc `callId` in `workspace-aspects-loader.ts:98-103`
- [x] 1.4 Add spans for load stages: id resolution, consumer FS load, scope/model load, extension merge (`componentExtensions`), env calc, dependency resolution, per-aspect aspect load, per-handler `onComponentLoad` (in `executeLoadSlot`)
- [x] 1.5 Record cache hit/miss attributes on spans for: workspace componentsCache, scopeComponentsCache, componentsExtensionsCache, scope loader cache, legacy ComponentLoader cache
- [x] 1.6 Verify no-behavior-change: `npm run lint`, run an e2e load-heavy spec (with `.only`), confirm `BIT_LOG=*` output shows nested trace prefixes; decide span-retention policy for whole-workspace `getMany` (design open question)

## 2. Load-failure issues (PR 2)

- [x] 2.1 Add `LoadFailure`-type issue class to `@teambit/component-issues` (non-tag-blocking; entries: failing id, phase, error message)
- [x] 2.2 Add per-trace issue collector on `LoadTraceContext` so deep aspect-loader code can report failures for a component without new parameters; dedupe by (componentId, failingId, phase)
- [x] 2.3 Attach issues at the catch-and-continue sites: `loadCompsAsAspects` (`workspace-component-loader.ts:486-489`), `requireAspects` error path (`scope-aspects-loader.ts:337-352`), `resolveInstalledAspectRecursively` (`workspace-aspects-loader.ts:678-682`); honor install-context ignore rules (`ignoreAspectLoadingError`)
- [x] 2.4 Verify `bit status` renders the new issue via the existing issues mechanism; confirm `bit tag` is not blocked by it
- [x] 2.5 e2e test: workspace with an env that throws on require → load succeeds, `bit status` shows the load-failure issue, tag proceeds

## 3. `bit debug-load` command (PR 3)

- [x] 3.1 Expose the aspects-merger pre-merge trace: persist `beforeMerge`/merge-source data from `aspects-merger.ts` onto the load result (or return alongside) instead of discarding it
- [x] 3.2 Expose env-resolution origin: which merge source determined the resolved env id
- [x] 3.3 Implement `DebugLoadCmd` in the workspace aspect: clear target component's caches → `workspace.get(id)` inside a fresh trace → collect trace + merge table + env origin + issues
- [x] 3.4 Render report with the shared output formatter (`scopes/harmony/cli/output-formatter.ts`): stages/timing tree with cache hit/miss, extension-sources table, env resolution, issues; clear error (no stack) for unknown id
- [x] 3.5 Add `--json` flag emitting the raw trace tree, merge sources, env resolution, and issues
- [x] 3.6 e2e test: `debug-load` on a component with a variant-provided env → all four sections present, env attributed to variants source; `--json` parses

## 4. Wrap-up

- [x] 4.1 Update `scopes/workspace/workspace/component-loading-redesign.md` Status table + log (Phase 1 done, PR links)
- [x] 4.2 Confirm Phase 2 groundwork: stage spans map 1:1 to the S0-S4 benchmark stages in the master doc
