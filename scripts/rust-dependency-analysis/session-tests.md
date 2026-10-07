# Scanner session subprocess validation

Run with an installed Bit checkout supplying TypeScript:

```sh
BIT_LEGACY_ROOT=/path/to/installed/bit node --test scripts/rust-dependency-analysis/session.test.cjs
```

The default module is `scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/session.ts`. When coordinating unmerged worktrees, set `BIT_SCANNER_SESSION_MODULE` to that module's absolute path. The harness transpiles only the scanner transport modules in memory; it does not run a repository build or mutate dependency files.

Tests launch real child processes using a deliberately controlled NDJSON fixture. The fixture runs with the current Node executable and an explicit argument vector (`fake-scanner.cjs`, mode, log path); no shebang wrappers, shell invocation, or global environment mutation is involved. Temporary paths contain spaces and Unicode, and tests verify argument copying and appended thread flags. This launcher works on Linux, macOS, and Windows. Assertions cover file-count and byte batch bounds, overlapping prefetch deduplication, cache copies and working-directory isolation, inline content-sensitive identities, preserved parse/read/unsupported outcomes, malformed identities/schema/UTF-8, crashes, duplicate responses, timeouts, abort/dispose, child cleanup with a SIGTERM handler (Unix requires escalation; Windows terminates directly), chunked output, stderr drainage, stdout/cache/request limits, and queue overload with recovery.

These tests validate the TypeScript subprocess lifecycle and wire contract. The fake scanner does not parse source or resolve imports; differential extraction and real traversal tests provide separate coverage. Cached path-prefetch outcomes represent a session snapshot. Inline scans use exact supplied contents and never reuse a disk-prefetch cache entry.

The same suite also exercises an actual built Rust scanner: disk and inline source extraction, type metadata, normalized-path deduplication, content-cache isolation/copies, parse/read/unsupported results, cancellation, and process termination. Build it with `cargo build --locked --workspace` from `native/`, or set `BIT_NATIVE_SCANNER` to an absolute executable path (including `.exe` on Windows). Set `BIT_NATIVE_SCANNER_REQUIRED=1` to fail if the binary is missing. Local protocol-only runs may skip this one native test; CI requires it on all three operating systems after building the scanner.

The session accepts an explicit `args?: readonly string[]` launcher configuration. Arguments are validated and copied; optional `--threads N` flags follow the supplied vector. Spawn retains `shell: false`, so paths and values are passed verbatim without shell quoting.
