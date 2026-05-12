# Audit 06 — Cache invalidation call sites

**Goal:** find every site that explicitly invalidates one or more loader caches, classify each by what it currently invalidates vs. what it _needs_ to invalidate, and identify the over-invalidation that will mask the unified-loader cache short-circuit (Lever 1 in `design-stage2-perf.md`).

**Scope:** explicit invalidations only — `Workspace.clearCache`, `Workspace.clearComponentCache`, `Workspace.clearAllComponentsCache`, `Consumer.clearCache`, `BitMap._invalidateCache`, `FsCache.deleteAllDependenciesDataCache`, and direct `componentsCache.deleteAll()` calls. Implicit invalidation (cache miss because hash inputs changed) is out of scope — it's already minimal-by-design.

**Cross-references:** `audit/03-caches.md` for the cache inventory; `design-stage2-perf.md` for why this audit was commissioned.

## Inventory by invalidation surface

There are five concrete invalidation surfaces today. All sites below route through one of these:

| Surface                                  | Defined at         | What it clears                                                                                                           |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `Workspace.clearCache(opts)`             | `workspace.ts:890` | scope + all four workspace-loader caches + status loader + dep-resolver + unified loader + `_componentList`              |
| `Workspace.clearAllComponentsCache()`    | `workspace.ts:902` | all four workspace-loader caches + legacy consumer's component cache + status loader + unified loader + `_componentList` |
| `Workspace.clearComponentCache(id)`      | `workspace.ts:913` | per-id entries in workspace loader + status loader + legacy consumer + unified loader; rebuilds `_componentList`         |
| `Consumer.clearCache()`                  | `consumer.ts:109`  | legacy consumer's component cache + fires `onCacheClear` subscribers (which include `workspace.clearCache`)              |
| `FsCache.deleteAllDependenciesDataCache` | `fs-cache.ts:39`   | the on-disk `.bit/cache/` dep-resolution cache (persistent)                                                              |

`Workspace.clearComponentCache` is the only narrow surface. Every other surface is "blow it all away."

## Call sites — classified

### Full-clear sites (15 total)

Each row is a call to `Workspace.clearCache()` or `Workspace.clearAllComponentsCache()` — both nuke the entire 311-component cache.

| #   | File:line                                                      | Trigger                                                              | Today clears | Should clear (minimum)                                                               | Verdict                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `clear-cache.ts` / `bit cc`                                    | user runs `bit cc`                                                   | everything   | everything                                                                           | **OK** — user-explicit                                                                                                                                                                                    |
| 2   | `workspace.ts:2173` (`_reloadConsumer`)                        | `bit watch` reloads consumer after FS events                         | everything   | everything                                                                           | **OK** — consumer is being rebuilt; reusing cache against new consumer is unsafe                                                                                                                          |
| 3   | `workspace.main.runtime.ts:237` (consumer subscriber)          | `consumer.onCacheClear` fires (triggered by `consumer.clearCache()`) | everything   | the components the consumer just lost                                                | **Over-clear** — but `consumer.clearCache()` itself isn't called from the workspace path I can find; this subscriber is dormant in practice. Verify before narrowing.                                     |
| 4   | `install.main.runtime.ts:462` (`installAndCompile`)            | install detected non-loaded envs; compile follows                    | everything   | the components whose envs were just installed (likely all that depend on those envs) | **Likely over-clear** — but envs cascade; narrowing requires env→component reverse index                                                                                                                  |
| 5   | `install.main.runtime.ts:488` (recurring install)              | install loop iteration                                               | everything   | same as #4                                                                           | **Same as #4**                                                                                                                                                                                            |
| 6   | `install.main.runtime.ts:754` (`tryWriteConfigFiles`)          | writing tsconfig/eslint config files for envs                        | everything   | components whose env config files changed                                            | **Likely over-clear**                                                                                                                                                                                     |
| 7   | `install.main.runtime.ts:1450` (`onPostInstall` event)         | external install completed (IPC from another process)                | everything   | depends on what was installed — usually everything is plausibly stale                | **OK** — out-of-process install can change anything                                                                                                                                                       |
| 8   | `watcher.ts:246` (UNMERGED file change)                        | scope's `unmerged-components.json` changed                           | everything   | the components recorded in unmerged state                                            | **Over-clear** — unmerged is a small list usually; could narrow to those IDs                                                                                                                              |
| 9   | `new-component-helper.main.runtime.ts:137`                     | created a new component                                              | everything   | the new component's ID + any components that import-by-pattern                       | **Over-clear** — usually a single new component should not invalidate 310 others                                                                                                                          |
| 10  | `node-modules-linker.ts:70`                                    | linked package.json files for some components                        | everything   | the components that were linked (we know the set — `this.components`)                | **Over-clear** — already iterates the list; could call `clearComponentsCache(this.components.map(c=>c.id))` instead                                                                                       |
| 11  | `codemod-components.ts:44`                                     | refactored relative→absolute imports for some components             | everything   | the codemodded IDs (`idsToReload` is right there in scope)                           | **Over-clear** — narrow to `idsToReload`                                                                                                                                                                  |
| 12  | `snapping.main.runtime.ts:1137` (`loadComponentsForTagOrSnap`) | tag/snap about to load components                                    | everything   | tag/snap IDs + their auto-tag-pending dependents                                     | **Over-clear with acknowledged comment** — `// don't clear only the cache of these ids. we need also the auto-tag. so it's safer to just clear all.` Narrow with `getAutoTagInfo()` to get the actual set |
| 13  | `export.main.runtime.ts:118`                                   | export completed; subsequent commands may run in same process        | everything   | components whose remote state changed (the exported ones)                            | **Over-clear** — but export's purpose is to ship, not to re-load; only matters for `bit test`/`bit cli` chains. Could narrow to exported IDs.                                                             |
| 14  | `workspace-generator.ts:90, 269`                               | `bit new` generated a new workspace                                  | everything   | everything (fresh workspace state)                                                   | **OK** — fresh workspace, no cached entries are valid                                                                                                                                                     |
| 15  | `ci.main.runtime.ts:584, 837`                                  | `bit ci` running multiple subcommands in one process                 | everything   | depends on the preceding subcommand                                                  | **OK to keep** — CI runs heterogeneous commands; conservatively clearing between them is safer than tracking what each step touched                                                                       |

### Per-id sites (5 total)

These already use the narrow surface; documenting them as "OK, don't regress":

| #   | File:line                                     | Trigger                                                                                                | Verdict |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| 16  | `watcher.ts:662`                              | component file changed in `bit watch`                                                                  | **OK**  |
| 17  | `workspace.main.runtime.ts:320` (cli.onStart) | aspects loaded at startup; clear their cache to re-load them with the loaded aspect runtime registered | **OK**  |
| 18  | `install.main.runtime.ts:279`                 | per-id during component generation                                                                     | **OK**  |
| 19  | `install.main.runtime.ts:589`                 | per-aspect during install aspect reload                                                                | **OK**  |
| 20  | `component-generator.ts:121`                  | per-id after generating components                                                                     | **OK**  |

### FS-cache sites (3 total — disk cache, separate from in-memory)

| #   | File:line                                  | Trigger                                                 | Verdict                                                                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 21  | `dependencies-loader.ts:140`               | catastrophic load failure → wipe dep cache as recovery  | **OK** — last-resort recovery; rare                                                                                                           |
| 22  | `dependencies.main.runtime.ts:142, 162`    | explicit user dep-cache reset                           | **OK** — user-explicit                                                                                                                        |
| 23  | `snapping.main.runtime.ts:1135` (tag/snap) | before tag/snap, blow dep cache for the whole workspace | **Over-clear** — dep cache is per-component; could narrow to the changed/tag set; this also goes to disk so the cost is more than just memory |

### Cascade-trigger sites (the indirect ones)

These don't directly call invalidation but feed into other paths that do:

| Site                                     | What it does                                                                                     | Cascade effect                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BitMap._invalidateCache` (line 748)     | `legacyBitMap._invalidateCache()` is called from `bit-map.ts:293` whenever the bitmap is mutated | Bumps internal version; does **not** chain to workspace caches — invalidation here is purely the consumer's view of bitmap state. Workspace caches stay valid because their hash inputs include the bitmap version counter (already wired in stage 1). |
| `configStore.invalidateCache` (line 443) | Comment says "no need to invalidate anything."                                                   | **Truly a no-op.** Workspace-config changes route through `triggerOnWorkspaceConfigChange()` which bumps the unified loader's config version. Already minimal.                                                                                         |

## Patterns of over-invalidation

Three recurring patterns emerge from the table above. Each implies a different mitigation:

### Pattern A — "we know the affected IDs but call full-clear anyway"

Sites #10 (node-modules-linker), #11 (codemod-components) literally have the affected IDs in scope. They could call `clearComponentsCache(ids)` (plural form already exists at `workspace.ts:921`) instead of `clearAllComponentsCache()`. Pure mechanical refactor; no new logic.

**Sites:** #10, #11.
**Mitigation:** swap the call. Two lines per site.

### Pattern B — "we know the seed IDs but auto-tag adds an unknown set"

Site #12 (snapping `loadComponentsForTagOrSnap`) has an explicit comment: it'd narrow but can't, because auto-tag dependents weren't computed yet. Sites #4, #5, #6 (install) have a similar shape — installed an env, but don't know which workspace components depend on it.

**Sites:** #4, #5, #6, #12, possibly #13.
**Mitigation:** compute the affected set, then narrow. For #12, `getAutoTagInfo(ids)` already exists in the workspace API — call it first, then clear `[...ids, ...autoTagIds]`. For #4/#5/#6, requires an env→dependents reverse index that doesn't exist today; needs a small new index.

### Pattern C — "we don't know what's affected, so we nuke"

Sites #3 (consumer subscriber), #8 (unmerged file change), #9 (new-component-helper) genuinely don't have the affected set in scope. These need either a reachability analysis or to accept the nuke as a worst-case fallback.

**Sites:** #3, #8, #9.
**Mitigation:** scope-by-scope. #3 may be dead code (verify caller). #8 — read the unmerged file before invalidating, clear only those IDs. #9 — the new component's ID is in scope but the dependent set is not; could narrow to "new component + everything that imports-by-pattern" but the import-by-pattern reverse index is non-trivial.

## Quantified expected wins

Listed in expected-impact order for the design's "edit one component, then bit status" scenario:

| Pattern          | Sites affected | Implementation cost                             | Expected win                                                                                                                 |
| ---------------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A                | #10, #11       | Mechanical (~10 LoC)                            | Small in isolation, but high-value because these run in install / refactor pipelines that today appear "slow" post-operation |
| B (snapping #12) | #12            | Small (~20 LoC, uses existing `getAutoTagInfo`) | **Medium** — `bit tag` / `bit snap` re-build the entire cache after clearing                                                 |
| B (install)      | #4, #5, #6     | Medium (new env→component index)                | **Large** — install is the most-painful "everything got slow afterward" experience                                           |
| C (#8, #9)       | #8, #9         | Small (#8) / Medium (#9)                        | Small per-incident, but covers common dev workflows                                                                          |
| C (#3)           | #3             | Audit first; may be dead code                   | None if dead; otherwise depends on what calls `consumer.clearCache()`                                                        |

## Concrete tasks this audit unblocks

Add to `tasks.md` under Tier 1 (mechanical, can ship before the broader stage-2 work):

```
- [ ] 8.11 (new) Narrow Pattern A invalidation sites to the affected ID set.
       Sites: node-modules-linker.ts:70 → clearComponentsCache(this.components.map(c=>c.id));
              codemod-components.ts:44   → clearComponentsCache(idsToReload).
       Risk: low; both sites already have the ID list in scope.

- [ ] 8.12 (new) Narrow snapping's pre-tag/snap clear to seed + auto-tag set.
       Site: snapping.main.runtime.ts:1135-1137.
       Strategy: call workspace.getAutoTagInfo(ids) first, build the affected
       set, clear only that set (both in-memory and dep FS cache).
       Risk: low-medium; the comment-acknowledged conservative behaviour
       suggests prior attempts failed — verify auto-tag set is complete.

- [ ] 8.13 (new) Audit Pattern C site #3 (consumer.onCacheClear subscriber).
       Question: is `consumer.clearCache()` ever called in practice from any
       active code path? If not, remove the subscriber (dead code). If yes,
       narrow the invalidation to the affected set the consumer.clearCache()
       caller already knows.

- [ ] 8.14 (new, deferred to after Lever 1 ships) Narrow install-time clears
       (#4, #5, #6). Needs an env→workspace-component reverse index; build
       only if benchmarks confirm install-time clears are dominating the
       perf profile that Lever 1 didn't already fix.

- [ ] 8.15 (new) Narrow watcher's UNMERGED file change (#8) — read the
       file's component-id list before invalidating, clear only those IDs.
       Risk: low.
```

8.14 is deliberately deferred. If Lever 1 (cache short-circuit) lands and `bit status` is sub-second on warm cache, the cold-after-install scenario will likely matter less. Defer until measured.

## What this audit does NOT change

- **Hash-input correctness** — the unified loader's per-phase hashing already determines whether a cached entry is _valid_. The invalidation surfaces above are aggressive but not unsafe; even with all the over-clears, no stale data was reported in stage 1. Narrowing is a perf concern, not a correctness concern.
- **`bit cc` semantics** — explicit user-triggered full clear stays as-is.
- **Cross-process invalidation** — site #7 (`onPostInstall` IPC) remains a full clear; another process did things we can't observe, so worst-case invalidation is appropriate.
- **The unified loader's `invalidate` API** — already supports `'all'`, `ComponentID[]`, `{ phase }`. The audit findings affect _callers_, not the API.

## Re-running this audit

```bash
# from bit6 root
grep -rn "clearCache\|clearComponentCache\|clearAllComponentsCache\|deleteAllDependenciesDataCache\|deleteAll()" \
  scopes/ components/ 2>/dev/null \
  | grep -v ".spec." | grep -v "/dist/" | grep -v "//.*clearCache"

# count by surface
grep -rn "workspace.clearCache\b" scopes/ components/ | wc -l
grep -rn "clearAllComponentsCache" scopes/ components/ | wc -l
grep -rn "clearComponentCache(" scopes/ components/ | wc -l
```

Compare against the table above; new sites added in the meantime should be classified into Pattern A/B/C.
