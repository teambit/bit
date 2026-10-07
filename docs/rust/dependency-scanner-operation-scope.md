# Reuse scanner processes within component loading

The first opt-in adapter owns a helper for each `generateTree()` call. A cold component normally produces one tree, so a multi-component load repeats native startup. `ComponentLoader.loadMany()` already groups these calls and keeps cold dependency loading sequential when multiple components miss the dependency cache. The scope keeps that policy and reuses the helper process across completed trees.

`DependenciesMain.provider()` registers a generic operation wrapper on the legacy component loader alongside its existing dependency callback. The loader wraps only its existing component pool. There is no reverse import from legacy loading into the dependency runtime, and no extra parameter is threaded through `DependenciesLoader`, `AutoDetectDeps`, or `buildTree`. Those asynchronous calls inherit an `AsyncLocalStorage` context. Nested component loads reuse the outer owner; independent overlapping loads have different owners.

Each tree borrows an exclusive scanner session. Completed trees clear all native path and content caches before returning the session to the pool, while retaining its subprocess. Subsequent trees read fresh file contents. Existing `cacheResolvedDependencies`, `cacheProjectAst`, component caches, and filesystem dependency caches retain their established behavior. Clearing them is neither necessary nor part of this change.

A scope holds at most four sessions, keyed by executable and current working directory. Concurrent or nested graphs use different leases. At capacity, extraction uses the existing legacy path immediately. It never waits for a lease while retaining an unbounded graph queue. A failed helper disables its executable/directory key for the rest of the operation; a later operation can retry. Helpers are created lazily by the session, so unused leases do not start processes.

The outer operation disposes every helper in `finally`, including when component loading fails. A detached asynchronous task retaining the closed context cannot acquire a helper from it; if that task starts a new component load, the load owns a fresh scope and disposes it in its own `finally`, rather than silently using legacy extraction for the rest of the process. Direct tree calls outside component loading retain individual ownership and dispose their helper after the tree finishes. Native execution remains opt-in through an absolute `BIT_RUST_DEPENDENCY_SCANNER` path.

`RustDependencyScannerSession.clearCache()` succeeds only after all pending and queued requests finish. It clears both caches and their byte accounting without restarting the subprocess. It refuses a busy or failed session; the lease owner retires that helper rather than exposing overlapping snapshots. Caller copies, response validation, queue bounds, cancellation, timeout, and fallback semantics remain session responsibilities.

Custom detector precedence and eligibility stay in precinct. Registration or parser-option changes between graphs are evaluated again. Registered nonmatching hooks retain the lazy inline-source path, using the exact contents already read rather than a separate filesystem snapshot. Releasing the graph clears those content-sensitive entries as well.

Run focused validation with an installed checkout supplying TypeScript and detector/resolver dependencies:

```sh
BIT_LEGACY_ROOT=/path/to/installed/bit \
BIT_TEST_NATIVE_SCANNER=/absolute/path/to/bit-dependency-scanner \
node --test scripts/rust-dependency-analysis/command-scope.test.cjs scripts/rust-dependency-analysis/component-load-scope.test.cjs
```

The fifteen tests use actual source modules and real native requests where appropriate. They cover helper reuse, disk and inline-cache reset, pending-reset refusal, nested loader/provider wiring, the cold component sequential guard, warm component-cache bypass, concurrent/independent ownership, configuration isolation, bounded leases, failed-helper retry policy, changed files, changed detector registration, owner exceptions, and closed-context behavior. The loader-focused cases isolate component construction while retaining the actual `loadMany()` pool and concurrency decision. Native-dependent cases explicitly skip when the helper path is absent.

The twelve helper/pipeline ownership cases now run in the Linux integration CI job with a locked, isolated detector/resolver installation and the actual scanner. The three provider/component-loader wiring cases remain a separate full-dependency suite, validated locally; the isolated tool installation does not recreate the legacy aspect graph. See [isolated CI setup](../../scripts/rust-dependency-analysis/ci/README.md) for the exact boundary and reproduction steps. This does not alter the session portability matrix. If scope or integration tests are invoked in CI, an absent `BIT_TEST_NATIVE_SCANNER` fails immediately rather than silently skipping native validation.

## Measured effect

Nine interleaved runs of eleven component-shaped graphs with 25 visited files produced exact final graph, path-map, missing-dependency, and error-code parity. Median graph-stage elapsed times:

| Detector context            |  Legacy | Per-tree native | Scoped native | Helper launches |
| --------------------------- | ------: | --------------: | ------------: | --------------- |
| Built-ins                   | 48.1 ms |         35.7 ms |       18.9 ms | 11 to 1         |
| Registered nonmatching hook | 47.8 ms |         38.3 ms |       20.6 ms | 11 to 1         |

Pooling saved approximately 17 ms beyond per-tree native extraction in this workload. Warm visited graphs launched no helpers: legacy/per-tree/scoped medians were 2.18/2.02/2.13 ms for built-ins and 2.19/2.25/2.32 ms for hooks. Runner module loading itself takes approximately 250 ms, so the complete worker saving is much smaller than the graph-stage ratio suggests. These are controlled integration measurements, not a `bit status` or other full-command speedup claim.
