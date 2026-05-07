# Component Loading Rewrite — Task Tracking

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

This is a fresh start after PR #10086 was abandoned. See README.md for why
the previous approach was discarded.

---

## Step 1 — Diff Harness (this PR)

> Build the safety net before any V2 code.

### Snapshot contract

- [x] Define `NormalizedSnapshot` (v0 fields: id, head, tags, extensionIds)
- [x] Document the contract (`SNAPSHOT-CONTRACT.md`)
- [ ] Extend to v1 fields (extensions with data, envId, envType, aspects post-slot)
- [ ] Extend to v2 fields (dependencies, isModified)

### Harness scaffolding

- [x] `serializeComponentForDiff` (`snapshot.ts`)
- [x] `diffSnapshots`, `diffResultSets` (`diff.ts`)
- [x] `LoaderDiffHarness` wrapper (`harness.ts`)
- [x] `BIT_LOADER_DIFF=1` env-flag detection (`index.ts`)
- [x] Wire into `Workspace` constructor

### V1-vs-V1 baseline

- [ ] Run `BIT_LOADER_DIFF=1 bit status` on this workspace; verify zero diffs
- [ ] Run `BIT_LOADER_DIFF=1 bit list` on this workspace; verify zero diffs
- [ ] Run `BIT_LOADER_DIFF=1 bit show <id>` on a few components; verify zero diffs
- [ ] Run on a workspace with custom envs; verify zero diffs
- [ ] Run on a workspace mid-lane; verify zero diffs
- [ ] Document the replay corpus in `docs/rfcs/component-loading-rewrite/REPLAY-CORPUS.md`

### Contract tests

- [x] Cherry-pick `e2e/harmony/component-loader-contract.e2e.ts` from PR #10086

---

## Step 2 — Recursion Root-Cause Spike

> Understand and decide before designing the new pipeline.

- [x] Trace the env↔component recursion in V1; document the call chain
- [x] Evaluate options: pre-pass, lazy env binding, cycle detection
- [x] Write up findings in `DECISIONS.md` (D-001)
- [ ] Get alignment on the approach before Step 3

Conclusion (see D-001): the recursion is a topological-ordering problem, not
a true cycle. Keep V1's two-pass shape (bulk load with `loadExtensions:
false`, then load extensions). Replace V1's one-level env-of-env grouping
with a proper recursive topological sort. Don't introduce lazy env binding.

---

## Step 3 — Incremental Seams (one PR each)

> Each seam is green on the diff harness before merging. No big-bang switchover.
> Order is deliberate: env-DAG sort first (D-001 says it's the load-order
> primitive everything else depends on), Enrichment last (most entangled with
> the recursion).

- [ ] Extract env-DAG topological sort (replaces `regroupEnvsIdsFromTheList`,
      makes `core-aspect-env` special case unnecessary)
- [ ] Extract `LoadPlan` construction (Discovery + Resolution) as a pure
      function. V1 still drives loading.
- [ ] Extract Hydration as a separate concern
- [ ] Extract Assembly
- [ ] Extract Execution
- [ ] Extract Enrichment (last — most likely to surface env-recursion bugs)

---

## Step 4 — Cleanup

- [ ] Decide whether to rewrite the orchestrator or keep the residual
- [ ] Remove the diff harness (or keep as a permanent debug tool, TBD)
- [ ] Update RFC with final architecture
