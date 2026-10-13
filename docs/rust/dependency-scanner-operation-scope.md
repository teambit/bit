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

## Embedded VCS dependency extraction

With `BIT_RUST_CLIENT_VCS=on`, dependency graph loading now selects the verified
workspace addon unless `BIT_RUST_DEPENDENCY_SCANNER` explicitly selects another
scanner or disables scanning. The existing OXC scanner is a shared Rust library;
its `dependencyScan` workspace operation runs on the VCS engine's bounded Rayon
pool. Each graph still owns its cache snapshot, and operation scope reuse clears
that snapshot before another graph leases the engine. No scanner child process
is needed for this path.

The embedded transport retains the scanner protocol's result validation,
timeouts, cancellation, queue limits and fallback semantics. The workspace frame
limits requests to 4 MiB; workers share an atomic 8 MiB output budget while work-stealing across the
whole request, without barriers between worker-sized batches. Unsupported syntax, parser options and custom
detectors retain canonical extraction. Built-in Node parser packages load only
when their detective is invoked; successful native extraction avoids those
precinct imports. Custom detector orchestration remains in Node.

`embedded-session.test.cjs` exercises actual addon results, graph parity, custom
detector precedence, cache invalidation, cancellation and transport failure.
Whole-command benchmarks remain the performance acceptance criterion.


## Native default dependency resolution

The embedded graph lease also handles `dependencyResolve`: one file's dependency
paths are resolved in parallel on the shared Rayon pool. Rust implements the
canonical CommonJS extension order, directory/package-main lookup, ancestor
`node_modules` search and logical symlink paths. It rereads source classification
and package files for each request, without carrying resolution caches between
graphs. Assignment-style CommonJS exports now use the legacy classifier's exact
AST shapes, including its distinction between computed identifiers and strings.

The adapter uses this path only for default JS-family lookups and bare imports
from TS-family files with a successful native scan. Relative TypeScript imports,
registered lookups, detector hooks and resolver configurations retain their
canonical lookup. Null results and declined requests also use canonical lookup.
Node's module-search-path side effect is preserved for successful native results.
Lookup implementations load lazily, so eligible graphs avoid loading the Node
parser and TypeScript resolver through filing-cabinet.

Requests retain session queue, cancellation, timeout and byte limits. Native
resolution additionally bounds dependencies (4096), filesystem probes (16384),
package nesting (32), individual package reads (1 MiB) and aggregate package reads
(8 MiB). Unsupported spellings, special files and JSON that cannot be faithfully
parsed decline to the existing lookup. The adapter does not change missing-import
reporting, path maps, traversal order or detector precedence.

`resolution.test.cjs` compares actual helper paths with the installed canonical
resolver; `resolution-integration.test.cjs` verifies source and compiled graph
integration, fresh package/source reads, custom lookup precedence and response
limits. Whole-command performance remains a separate acceptance requirement.


The embedded resolver also supports relative TypeScript imports when the installed
lookup uses TypeScript 5.9.2. It follows the canonical fixed CommonJS compiler
options: typed/declaration candidates precede JavaScript, extension substitutions
preserve JSX/MTS/CTS order, and package `typings`, `types`, `main` and directory
indexes retain their precedence. Successful relative TypeScript lookups do not
perform the CommonJS module-search-path side effect. Missing results fall back to
the installed lookup, including its final CommonJS attempt.

Other TypeScript versions, package `typesVersions` mappings and unsupported JSON retain canonical lookup. The adapter checks
the installed compiler version without loading its parser. Differential tests
cover 2,400 competing extension cases plus package-entry and directory rules;
source and compiled graph tests exercise native results and module-path behavior.
