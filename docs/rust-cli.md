# The Rust `bit` CLI

`native/cli` builds a `bit` executable. Commands implemented in Rust run in
that process. Every other command runs the Node.js Bit CLI with the same
arguments, terminal, environment and exit code. The Node.js CLI does not know
this binary exists, so nothing outside `native/` has to change for it to work.

The plan and milestones are tracked in
[zkochan/bit#125](https://github.com/zkochan/bit/issues/125).

## Dispatch

1. The first argument names the command, as the Node.js CLI spells it,
   aliases included.
2. A command in the table in `native/cli/src/commands.rs` runs natively.
3. A native command may decline its input, for example `--help`, a directory
   outside a workspace, or a yarn workspace. A declined command is delegated.
4. Everything else is delegated.

On Unix, delegation replaces the process image, so the Node.js CLI keeps the
PID, the terminal and signal handling. On Windows it runs as a child process.
The Rust process ignores Ctrl-C and exits with the child's exit code.

| Variable | Effect |
| --- | --- |
| `BIT_NATIVE=off` | Delegate every command. Use it for A/B comparisons and bisecting. |
| `BIT_NATIVE_TRACE=1` | Print every dispatch decision and the delegated command line to stderr. |
| `BIT_NODE_CLI` | Path of the Node.js CLI entry: `@teambit/bit`'s `bin/bit`, or a checkout's `bin/bit.js`. |
| `BIT_NODE_BINARY` | The Node that runs the entry. |

## Finding the Node.js CLI

Discovery only inspects paths. It never downloads anything or runs Node. The
first match wins:

1. `BIT_NODE_CLI`.
2. `../node_modules/@teambit/bit/bin/bit` relative to the executable's
   directory. This is the bvm layout once bvm ships this binary as `bin/bit`.
3. bvm's default link, `<bvm>/links/<DEFAULT_LINK>/node_modules/@teambit/bit/bin/bit`.
   The bvm directory is `BVM_GLOBALS_DIR`, else `%LOCALAPPDATA%\.bvm` on
   Windows, else `~/.bvm`.
4. A `bit` on `PATH` that is not this executable, typically bvm's wrapper script.

The entry runs with `BIT_NODE_BINARY`, else the newest Node in the bvm
directory the entry lives in, else `node` from `PATH`. That Node's directory
goes first on `PATH`, as bvm's wrapper does.

To try the binary against a checkout:

```sh
cd native && cargo build -p bit-cli
BIT_NODE_CLI=$PWD/../bin/bit.js ./target/debug/bit status
```

## The JavaScript host

Some behavior is still implemented by aspects in JavaScript, for example an
env's `getDependencies()` or the compile step after `bit install`. Native
commands reach it through `native/cli/src/host/host.js`. The script is embedded
in the binary and runs with `node -e` on the Node.js CLI's own Node. It starts
on the first call only, and it loads only modules that the published
`@teambit/bit` package already ships.

The protocol is one JSON request per line on the script's stdin,
`{id, method, params}`, and one response per line on its stdout,
`{id, result}` or `{id, error}`. Output from aspects goes to stderr, so it
reaches the terminal without corrupting the protocol. Closing stdin ends the
script. A script that does not exit within five seconds is killed.

Each host method is removed once its behavior is ported to Rust.

## Native commands

| Command | Crate | Host methods | Declines when |
| --- | --- | --- | --- |
| `install`, `in` | `bit-install` ([details](rust/native-install.md)) | `hostInfo`, `envPolicy`, `appTypes`, `packageJsonProps`, `transformPackageJson`, `afterInstall` | `--help`, outside a workspace, non-UTF-8 arguments, the yarn package manager, a Node.js CLI found only as a wrapper script |

| `mini-status --json`, `ms -j` | `bit-object-import` status engine, `bit-ignore` | none | any other flag or argument, outside a workspace, a workspace the engine does not own: configured extensions or aspect settings, environments in the generator config, a global `.bitrc.jsonc`, a scope in `.git/bit`, a checked-out lane, more than 4096 components |

| `status --json`, `s -j` | `bit-object-import` workspace engine, `bit-ignore`, `node-semver`'s `npm` module | none | any other flag or argument, outside a workspace, a locale whose collation tailors id characters, the `no-fs-cache` feature in any config layer, a workspace or component the engine does not own (configured extensions, environments other than `teambit.harmony/node`, component-level dependency policies, a scope in `.git/bit`, a lane), files the scanner leaves to JavaScript detectors (such as `.mdx`), unresolved imports, a main file outside the inventory |

`confirm` prompts are asked by the Rust process itself, since it owns the terminal.

Native commands append to the workspace's `command-history` file (in `.bit`,
or `.git/bit`) as the Node.js CLI does. A declined command writes nothing, so
the Node.js CLI's own lines are not duplicated.

### Ignore rules

The workspace inventory follows `.gitignore`, `.bitignore` and Bit's own lists
through `ignore` 3.3.10, the npm package `@teambit/legacy.bit-map` uses. The
`bit-ignore` crate (`native/ignore`) ports its rule compiler. Each replacement
step keeps the package's original JavaScript regular expression and runs it
with `regress`, so the compiled rule sources are the ones Node would produce.
Its tests compare them with sources the package itself produced.

The port includes the package's module-level cache. The cache is keyed by the
pattern alone, so a pattern compiled once as positive stays positive when it
is later negated, as in Node. Patterns named like `Object.prototype` members,
such as `constructor`, break the package and are declined.

### Status inputs

`status --json` follows the Node.js glue it replaces (`scopes/harmony/bit/rust-status*.ts`, `rust-client-capture.ts`, `rust-fresh-dependencies.ts`). The engine reads the workspace, the models and the dependency caches. The CLI computes what Node computed:

- **Dependency policy.** The Node environment's policy, the workspace policy and the root `package.json`, merged as `statusPolicy` merges them.
- **Semver facts.** npm `semver`'s `valid`, `validRange` and `coerce`, from the `npm` module of pnpm's `node-semver` fork, a port of semver 7.7.1 tested against the package's own output.
- **Issues.** The six issue classes status can report, formatted like `IssuesList.toObjectIncludeDataAsString()`, with cycles found by Tarjan's algorithm.
- **Fresh detection.** The default dev-file patterns, as `minimatch` 3.0.5 matches them; the core aspect packages from `scopes/harmony/bit/core-aspect-ids.json`; the bundled TypeScript version, read from the Node.js CLI's install. Node's built-in module list comes from the Node.js CLI's own Node. It is asked once per binary and cached in `<BIT_GLOBALS_DIR>/native-cli`.
- **Dependency cache.** Fresh detections are written with `cacache`'s format once the command has validated them, after the invalidation check `FsCache` runs.
- **Ordering.** Result rows are sorted like `localeCompare` sorts them under the root collation.

## Versions

A native command reproduces the behavior of the Node.js CLI built from the same
commit. Delegated commands run whatever Node.js CLI discovery finds. Both are
shipped together, so they agree. A binary paired with an older Node.js CLI can
disagree on details the two versions changed in between.

## Relation to the in-process integration

Earlier work ran Rust inside the Node.js CLI, through the `bit-workspace.node`
addon and spawned helpers, behind `BIT_RUST_*` and `BIT_NATIVE_INSTALL` flags.
That integration is superseded. The crates it uses become libraries of this
CLI. The Node.js glue is removed from the integration branch once this CLI
covers the same commands, and it is not ported to `teambit/bit` master.
