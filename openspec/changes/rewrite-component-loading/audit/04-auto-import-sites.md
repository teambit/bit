# Audit 1.4 — Implicit auto-import call sites

**Goal:** find every site that relies on the implicit `ScopeComponentLoader.get` behaviour where a missing component triggers a network import. The proposal removes this; each site needs an explicit replacement.

## How the auto-import works today

`scope-component-loader.ts:25-44`:

```ts
async get(id, importIfMissing = true, useCache = true) {
  // ...
  if (!modelComponent && importIfMissing && this.scope.isExported(id)
      && !this.importedComponentsCache.get(id.toString())) {
    await this.scope.import([id], { reason: `${id} because it's missing from the local scope` });
    this.importedComponentsCache.set(id.toString(), true);
    modelComponent = await this.scope.legacyScope.getModelComponentIfExist(id);
  }
  // ...
}
```

Public surface: `Scope.get(id, useCache=true, importIfMissing=true)` at `scope.main.runtime.ts:822`.

Auto-import fires when:

1. The component is missing from the local scope, AND
2. The component is exported (has a remote scope), AND
3. The 30-min `importedComponentsCache` doesn't already record an attempt.

## Call sites by category

### Explicit opt-out (already pass `importIfMissing=false`) — no migration needed

These callers already disable auto-import; they handle missing components themselves. They migrate trivially: when the rewrite removes the parameter, behaviour is preserved.

- `scopes/component/component-compare/component-compare.main.runtime.ts:154` — `workspace.scope.get(componentId, false)` (note: positional means `useCache=false`, but the same call shape — verify against the new API)
- `scopes/pipelines/builder/builder.main.runtime.ts:241` — `scope.get(envCompId, false)`
- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:499` — `workspace.scope.get(id, undefined, false)` (explicit `importIfMissing=false`)

### Internal — vanishes with rewrite

- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:794` — internal call inside the loader being deleted in task 9.1.

### Relies on implicit auto-import — explicit `scope.import` migration

These sites call `scope.get(id)` with default args, so auto-import fires when the component is missing remotely. Each needs an explicit `await scope.import([id])` first (or a call to the new `workspace.getOrImport` helper from task 5.4).

| #   | File:line                                                     | Context                                                              | Migration                                                                                                                                                                                                |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `scopes/harmony/api-server/api-for-ide.ts:735`                | IDE getCompDetails — IDE asks about an arbitrary component           | Use `workspace.getOrImport(compId)`. The IDE legitimately wants the network fetch.                                                                                                                       |
| 2   | `scopes/harmony/aspect/aspect.main.runtime.ts:92`             | aspect resolution from scope when not in workspace                   | If aspect is genuinely on remote, caller already loads workspace first; explicit `scope.import` if not found.                                                                                            |
| 3   | `scopes/harmony/aspect/aspect.main.runtime.ts:171`            | debug-aspects command                                                | Same as #2.                                                                                                                                                                                              |
| 4   | `scopes/workspace/workspace/workspace.main.runtime.ts:253`    | LegacyComponentLoader subscriber — bridges legacy load requests      | Migrate the subscriber to use `getOrImport`; this is one of the highest-traffic sites.                                                                                                                   |
| 5   | `scopes/workspace/workspace/workspace.ts:1062`                | inside workspace internal helper (verify the helper's caller intent) | Likely needs `getOrImport` since it's invoked during workspace initialization paths.                                                                                                                     |
| 6   | `scopes/workspace/workspace/workspace.ts:1735`                | unmerged-head fallback in lane operations                            | Lane head must be present; migrate to `getOrImport`.                                                                                                                                                     |
| 7   | `scopes/component/remove/remove.main.runtime.ts:225`          | remove flow checks scope for bitmap entry                            | Local-only — these IDs are already in `.bitmap`, so auto-import only fires if scope is incomplete. Safe to migrate to plain `scope.get` (no import) and surface "not in local scope" as a clearer error. |
| 8   | `scopes/component/remove/remove.main.runtime.ts:262`          | same flow                                                            | Same as #7.                                                                                                                                                                                              |
| 9   | `scopes/component/remove/remove.main.runtime.ts:300`          | same flow                                                            | Same as #7.                                                                                                                                                                                              |
| 10  | `scopes/component/remove/remove.main.runtime.ts:413`          | getHeadIfExists                                                      | Always wants local data; migrate to plain `scope.get` (no auto-import).                                                                                                                                  |
| 11  | `scopes/component/deprecation/deprecation.main.runtime.ts:81` | deprecation marker                                                   | Local data only; migrate to plain `scope.get`.                                                                                                                                                           |
| 12  | `scopes/component/snapping/snapping.main.runtime.ts:445`      | snap parent resolution — `foundInUpdated                             |                                                                                                                                                                                                          | this.scope.get(id)` | Snap parent should already be locally available (we just loaded it). Migrate to plain `scope.get`. |

## Migration breakdown

| Action                                                       | Sites                         |
| ------------------------------------------------------------ | ----------------------------- |
| Already opts out — no change                                 | 3                             |
| Internal — vanishes                                          | 1                             |
| Migrate to `workspace.getOrImport` (genuinely needs network) | 6 (#1, #2, #3, #4, #5, #6)    |
| Migrate to plain `scope.get` (local-only data)               | 6 (#7, #8, #9, #10, #11, #12) |

**Total: 12 sites.** Slightly more than the design's "~6" estimate. Six need genuine network resolution (use `getOrImport`); six were quietly relying on auto-import for safety but actually only need local data — the new explicit error becomes informative rather than triggering a hidden network round-trip.

## Notes

- The `importedComponentsCache` 30-min TTL existed to suppress repeated network attempts during a single CLI invocation. Removing implicit auto-import makes this unnecessary — a caller that genuinely needs network resolution calls `scope.import([id])` once explicitly, which already has its own deduplication.
- All 12 sites are concentrated in 7 files. The migration is bounded and reviewable in a single PR.
- During stage 1, the loader emits a deprecation warning whenever `not-found` would have triggered auto-import in the old path — this lets us catch any third-party aspect that quietly depended on the behaviour.
