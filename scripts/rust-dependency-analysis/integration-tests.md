# Opt-in scanner integration validation

Run after applying both scanner-session and production-integration changes:

```sh
BIT_LEGACY_ROOT=/path/to/installed/bit \
BIT_TEST_NATIVE_SCANNER=/absolute/path/to/bit-dependency-scanner \
node --test scripts/rust-dependency-analysis/integration.test.cjs
```

For an unmerged integration worktree, add `BIT_SCANNER_INTEGRATION_ROOT=/absolute/path/to/integration/checkout`. The runner transpiles actual TypeScript sources in memory and loads the real installed detective and filing-cabinet resolver packages. It requires the scanner coordinator files in that source tree. No resolver, dependency-tree, or detector implementation is mocked.

Thirteen tests pass with the hardened scanner from PR #9. Six direct routing tests use controlled session outcomes to verify native/legacy selection, custom detector precedence, exact predicate counts, options/core filtering, parse failure propagation, and no-check behavior. Seven tests launch the actual native binary and compare final resolved trees, ordered path maps, missing dependencies, and error codes with the backend disabled. Diagnostic text is parser-specific and intentionally not required to match.

Real-backend coverage includes a dependency cycle, filtered invalid source, core modules, an npm dependency, warm visited cache, native TS parse errors, unsupported CommonJS classification, a missing executable, registered nonmatching hooks, disposal after filter exceptions, and source-snapshot coherence. The snapshot test changes the same file between path-prefetch, the authoritative legacy read, and a custom predicate; lazy native extraction must analyze exactly the contents read, preserving the separate prefetched cache entry.

Without `BIT_TEST_NATIVE_SCANNER`, the seven real-backend cases report skipped instead of claiming native parity. The six controlled cases still run. The harness supplies TypeScript compilation only, not a full repository typecheck or command-level performance benchmark. Global detector hooks and environment settings are restored between tests; do not run these tests concurrently within one process.
