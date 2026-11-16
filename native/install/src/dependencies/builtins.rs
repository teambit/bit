//! Node.js built-in modules ([`BUILTINS`]; `require('module').builtinModules`), which are never
//! external package dependencies.
//!
//! Recognizes `node:`-prefixed and bare core Node.js module specifiers via [`is_builtin`] against [`BUILTINS`] during dependency resolution.

/// Canonical list of Node.js built-in module names (`require('module').builtinModules`) checked by [`is_builtin`].
const BUILTINS: [&str; 45] = [
    "assert",
    "sea",
    "sqlite",
    "test",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "domain",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "sys",
    "timers",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

/// Return `true` when `specifier` names a built-in Node.js module in [`BUILTINS`] or a `node:`-prefixed module.
#[inline]
#[must_use]
pub fn is_builtin(specifier: &str) -> bool {
    let trimmed = specifier.trim();
    if trimmed.is_empty() || trimmed.starts_with(['.', '@']) {
        return false;
    }
    if let Some(rest) = trimmed.strip_prefix("node:") {
        return !rest
            .trim()
            .trim_matches(['/', '\\'])
            .is_empty();
    }
    let root = trimmed
        .split(['/', '\\'])
        .next()
        .map_or("", str::trim_end);
    BUILTINS.contains(&root)
}
