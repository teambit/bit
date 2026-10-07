# Scanner session subprocess validation

Run with an installed Bit checkout supplying TypeScript:

```sh
BIT_LEGACY_ROOT=/path/to/installed/bit node --test scripts/rust-dependency-analysis/session.test.cjs
```

The default module is `scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/session.ts`. When coordinating unmerged worktrees, set `BIT_SCANNER_SESSION_MODULE` to that module's absolute path. The harness transpiles only the scanner transport modules in memory; it does not run a repository build or mutate dependency files.

Tests launch real child processes using a deliberately controlled NDJSON fixture. Per-test executable wrappers and logs isolate child behavior without modifying global environment variables. Assertions cover file-count and byte batch bounds, overlapping prefetch deduplication, cache copies and working-directory isolation, inline content-sensitive identities, preserved parse/read/unsupported outcomes, malformed identities/schema/UTF-8, crashes, duplicate responses, timeouts, abort/dispose, SIGTERM-resistant child cleanup, chunked output, stderr drainage, stdout/cache/request limits, and queue overload with recovery.

These tests validate the TypeScript subprocess lifecycle and wire contract. The fake scanner does not parse source or resolve imports; differential extraction and real traversal tests provide separate coverage. Cached path-prefetch outcomes represent a session snapshot. Inline scans use exact supplied contents and never reuse a disk-prefetch cache entry.
