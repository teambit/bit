//! Node.js built-in modules (`require('module').builtinModules`), which are never
//! package dependencies.

const BUILTINS: [&str; 42] = [
    "assert",
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

/// Whether `specifier` names a built-in module or one of its subpaths (`fs/promises`).
#[must_use]
pub fn is_builtin(specifier: &str) -> bool {
    let trimmed = specifier.trim();
    if let Some(rest) = trimmed.strip_prefix("node:") {
        return !rest.trim().is_empty();
    }
    let root = trimmed
        .split('/')
        .next()
        .unwrap_or(trimmed);
    BUILTINS.contains(&root)
}
