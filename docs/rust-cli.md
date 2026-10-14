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

| Variable             | Effect                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `BIT_NATIVE=off`     | Delegate every command. Use it for A/B comparisons and bisecting.                        |
| `BIT_NATIVE_TRACE=1` | Print every dispatch decision and the delegated command line to stderr.                  |
| `BIT_NODE_CLI`       | Path of the Node.js CLI entry: `@teambit/bit`'s `bin/bit`, or a checkout's `bin/bit.js`. |
| `BIT_NODE_BINARY`    | The Node that runs the entry.                                                            |

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

| Command                                                                                                 | Crate                                                                                                                                                                                                                                    | Host methods                                                                                    | Declines when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install`, `in`                                                                                         | `bit-install` ([details](rust/native-install.md))                                                                                                                                                                                        | `hostInfo`, `envPolicy`, `appTypes`, `packageJsonProps`, `transformPackageJson`, `afterInstall` | `--help`, outside a workspace, non-UTF-8 arguments, the yarn package manager, a Node.js CLI found only as a wrapper script                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mini-status`, `ms`, with or without `--json`; `status --quick [--json]`                                | `bit-object-import` status engine, `bit-ignore`                                                                                                                                                                                          | none                                                                                            | any other flag or argument, outside a workspace, a workspace the engine does not own: configured extensions or aspect settings, environments in the generator config, a global `.bitrc.jsonc`, a scope in `.git/bit`, a checked-out lane, more than 4096 components                                                                                                                                                                                                                                                                                                                                                                                                          |
| `status --json`, `s -j`, and `status` with `-w`, `--verbose`, `--strict`, `--fail-on-error`, `--expand` | `bit-object-import` workspace engine, `bit-ignore`, `node-semver`'s `npm` module                                                                                                                                                         | none                                                                                            | any other flag or argument (`-c`, `--lanes`), for the report: invalid, removed, soft-tagged or local-only components and pending imports, `UntrackedDependencies` issues on a color terminal, `ExternalEnvWithoutVersion` issues, outside a workspace, a locale whose collation tailors id characters, the `no-fs-cache` feature in any config layer, a workspace or component the engine does not own (configured extensions, environments other than `teambit.harmony/node`, component-level dependency policies, a scope in `.git/bit`, a lane), files the scanner leaves to JavaScript detectors (such as `.mdx`), unresolved imports, a main file outside the inventory |
| `diff --json`, `diff <component> --json`                                                                | the status capture, the engine's `workspaceDiff`                                                                                                                                                                                         | none                                                                                            | other arguments (versions, flags), patterns outside `[a-z0-9_./-]` or matching other than one component, a configured `git_path`, a tagged component whose model has no head, a dependency change neither side has a version for, a stored custom package name, Windows, and everything `status --json` declines                                                                                                                                                                                                                                                                                                                                                             |
| `list`, `ls` with `-i`, `-j`, `-l`, `-s`, `-n`                                                          | the engine's `scopeList` (with the current lane's heads), the `.bitmap`                                                                                                                                                                  | none                                                                                            | a remote scope, `--outdated`, `--include-deleted`, a lane missing from the index, namespaces with regular expression syntax other than `*` and `.`, and ids or locales outside the native collation                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `import <ids...> -x`, `import -o`, `import`, `fetch -c <ids...>`, `fetch <scope>/<lane>... --lanes`     | the engine's `commandInboundPrepare` and `commandInboundApply` (it fetches from the remotes through `bit-object-import`'s transfer)                                                                                                      | none                                                                                            | an import that installs (no `-x`), other flags (`--merge`, `--override`, `--path`, `--dependencies`, `--lane-only`, …), implicit, main or more than 32 lane IDs, components that already have a local model, ids missing on the remote, and whatever else the engine leaves to Node                                                                                                                                                                                                                                                                                                                                                                                          |
| `export [ids...]`, `e`, `--origin-directly`, `--resume <client-id>` | the engine's `commandOutboundPrepare`, `commandOutboundApply` and `commandOutboundFinalize` for staged and selected component exports; validation and persist failures are reported after remote actions | none | unsupported flags, wildcard or malformed IDs, lanes, hub (unconfigured) remotes, and operations the engine declines before remote actions |
| `checkout <to> [pattern] -x`, `U`                                                                       | the engine's `commandPrepare`, `commandPlan` and `commandApply`, the status capture                                                                                                                                                      | none                                                                                            | without `-x` (an install follows), `--all` with `head` or `latest`, `main`, other flags, a version outside `head`, `latest`, `reset`, `head~N`, a snap hash or a semver tag, an unresolved conflict without `--auto-merge-resolve` or `--manual` (the Node.js CLI prompts), a binary conflict, a plan that needs a policy projection, snapshot or lane step, unexported components, and everything `status --json` declines                                                                                                                                                                                                                                                  |
| `merge [pattern] -x`                                                                                    | the checkout engine requests, `commandPolicyPrepare`, `commandDependencyDetect`, `commandDependencyComplete`, `commandFinalize`, the status capture with cached dependencies verified, `pnpm-lockfile`                                   | none                                                                                            | without `-x`, flags other than `--no-snap`, `--message`, `--auto-merge-resolve`, `--manual` and `--verbose`, a lane step, an unresolved conflict without a strategy, components with compositions, docs or app files, a configured `force_local_build`; when the merge snaps: dependents that would be auto-snapped, snap issues other than the ones the engine predicted, a custom `rootComponentsDirectory`, Windows; and everything `checkout` declines                                                                                                                                                                                                                   |
| `merge [pattern] --resolve`, `-m`                                                                       | the engine's `commandResolvePrepare`, `commandResolvePlan`, `commandResolveFinalize` and `commandResolveApply`, the status capture with a reset dependency cache                                                                         | none                                                                                            | other flags (`--abort` stays with Node), a merged resolver configuration pending, snap-blocking issues, and everything `snap` declines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `lane merge <lane> [pattern] -x`                                                                        | the merge engine requests with the lane options, `lanePatternIds`, `commandLaneFinalize` (history keys, logs and squash dates from the CLI); snapping lane merges with `commandSnapshotReceipt` and the `squashLog` of squashed versions | none                                                                                            | other `lane` commands, flags outside the `parseRustLaneCommand` grammar, a lane merge that snaps hidden components, fails snapping or sets `noAutoSnap`, `--no-snap` with squashing (Node fails to squash it), and everything `merge` declines                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lane list`, `lane list --json`                                                                         | the engine's `laneList` and `scopeList`, `.bitmap` and `scope.json`                                                                                                                                                                      | none                                                                                            | `--details`, `--remote`, `--merged`, `--not-merged`, lanes Node migrates to record deleted components (schema before `1.0.0`), lanes with a readme component or update-dependents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `snap [component-id]`                                                                                   | the engine's `commandSnapPrepare`, `commandSnapPlan`, `commandSnapFinalize` and `commandSnapApply`, the status capture with cached dependencies verified, `pnpm-lockfile`                                                                | none                                                                                            | flags other than `--message`, `--unmodified`, `--unmerged` and `--skip-auto-snap`, a pattern with state selectors (`$…`, `AND`), classes, braces or extglobs, snap-blocking issues, squashing lane snaps, a configured `force_local_build`, a merged configuration pending, Windows, and everything `status --json` declines                                                                                                                                                                                                                                                                                                                                                 |
| `tag [patterns...]`, `t`                                                                                | the engine's `commandTagPrepare`, `commandTagPlan`, `commandTagFinalize` and `commandTagApply`, the status capture with cached dependencies verified, `pnpm-lockfile`                                                                    | none                                                                                            | `--build`, `--soft`, `--persist`, editor, publish and other flags outside `--message`, `--ver`, `--increment`, `--patch`/`--minor`/`--major`/`--pre-release`, `--prerelease-id`, `--auto-tag-increment`, `--increment-by`, `--unmodified`, `--unmerged`, `--snapped` and `--skip-auto-tag`; patterns with state selectors, classes, braces or extglobs; snap-blocking issues; lanes; a configured `force_local_build`; and everything `snap` declines                                                                                                                                                                                                                        |

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

`status` reproduces `StatusMain.status` over the workspace engine. The engine reads the workspace, the models and the dependency caches. The CLI computes what Node computed:

- **Dependency policy.** The Node environment's policy, the workspace policy and the root `package.json`, merged as `statusPolicy` merges them.
- **Semver facts.** npm `semver`'s `valid`, `validRange` and `coerce`, from the `npm` module of pnpm's `node-semver` fork, a port of semver 7.7.1 tested against the package's own output.
- **Issues.** The six issue classes status can report, formatted like `IssuesList.toObjectIncludeDataAsString()`, with cycles found by Tarjan's algorithm.
- **Fresh detection.** The default dev-file patterns, as `minimatch` 3.0.5 matches them; the core aspect packages from `scopes/harmony/bit/core-aspect-ids.json`; the bundled TypeScript version, read from the Node.js CLI's install. Node's built-in module list comes from the Node.js CLI's own Node. It is asked once per binary and cached in `<BIT_GLOBALS_DIR>/native-cli`.
- **Dependency cache.** Fresh detections are written with `cacache`'s format once the command has validated them, after the invalidation check `FsCache` runs.
- **Ordering.** Result rows are sorted like `localeCompare` sorts them under the root collation.

### Diff output

`diff --json` follows `rust-diff.ts` and `rust-diff-metadata.ts`, and formats like `@teambit/legacy.component-diff`:

- **File diffs.** The engine runs `git diff`. The CLI relabels the headers like `formatFileDiff`, including JavaScript's `$` replacement patterns in file names.
- **Metadata.** `diffMetadata` is ported field by field. That covers `object-diff` and `array-difference` for the printable fields, `ComponentID` equality for dependencies, and npm `semver` loose comparison through `node-semver`'s `npm` module. Extension configurations are written to temporary files and compared with `git diff --no-index --color`, as `getOneFileDiff` does.
- **Colors.** Metadata text is colored like chalk 4.1.2 when `supports-color` 7.2.0 would color stdout: flags such as `--no-color`, `FORCE_COLOR`, a terminal, `TERM`, CI variables.
- **File order.** A component's files are listed in `globby`'s order: directories breadth first, each directory's entries in byte order, as libuv sorts them. Node lists directories unsorted on Windows, so diff declines there.

The Node.js CLI reports rows in a varying order, since components are processed concurrently. The native order is the bitmap's.

### Write commands

Write commands keep two phases. Until the commit starts, any failure declines, and the Node.js CLI runs the command from scratch. That covers an engine decline, a report that cannot be formatted and a progress receipt that does not validate. After the commit starts, failures belong to the command. They are printed in red on stderr, the command history records them, and the exit code is 1, as the Node.js CLI's error handler does.

`checkout` and `merge` print Bit's loader lines on stdout like `ora` 5.4.1 off a terminal (`- <text>`, `✔ <text>`), with timings in `pretty-time`'s format. The reports are ported from `checkoutOutput`, `mergeReport` and the `merge-output` helpers. Details hidden behind `bit details` are written to `<BIT_GLOBALS_DIR>/last-command-details` as `CommandRunner` writes them.

When a merge changes configuration, the engine asks for the built-in Node environment's defaults, which are constants of the environment (`commandDefaultNodeReceipt`), and for a dependency detection of the merged files.

When a merge, `bit snap` or `bit tag` writes versions, the CLI supplies what the engine cannot know (`commandSnapshotReceipt`, `resolveSnapshotReceipt`):

- **Snapshot identity.** New snap hashes (`newSnapHash`: the SHA-1 of a random UUID v4) and a batch id.
- **Log.** The username comes from Bit Cloud's `/user` endpoint when a `user.token` is configured, else from `user.name`. The email comes from `user.email`. Both follow `getConfig`: environment, workspace, scope and global config, then `git config --list`.
- **Bit version.** The version of the `@teambit/bit` package the Node.js CLI runs from.
- **Dependency graph.** Each snapped component's `DependenciesGraph` (`calcDependenciesGraph`), cut from `pnpm-lock.yaml`. The lockfile is read and filtered by pnpm's `pnpm-lockfile` crate, the code `@pnpm/napi` runs for the Node.js CLI. Workspace components are named by their versions (`createFileVersionReplacer`): the snapped ones by their new hashes as `0.0.0-<hash>`, the others by their workspace versions. The engine stores the graph as a Source and sets `dependenciesGraphRef`.

Before the snap, the whole workspace is captured again with a fresh dependency cache. The issues that block a snap are compared with the engine's prediction. A predicted failure prints the snap error and keeps the merged files, as Node does.

When an engine request fails, the engine now returns the reason, and `BIT_NATIVE_TRACE=1` prints it with the decline.

### Component patterns

`snap` and `tag` match component id patterns as `matchComponentPatterns` does, with `multimatch` 5 over `minimatch` 3.1.5: comma-separated patterns, `*`, `?`, `**`, and `!` negation (a list of negations starts from `**`). An id is kept when the last pattern that matches it is not negated, and ids keep the workspace order. A test checks the port against results `multimatch` produced.

## Versions

A native command reproduces the behavior of the Node.js CLI built from the same
commit. Delegated commands run whatever Node.js CLI discovery finds. Both are
shipped together, so they agree. A binary paired with an older Node.js CLI can
disagree on details the two versions changed in between.

The JavaScript host uses only modules the published `@teambit/bit` package
ships:

- the default node env's dependency policy and `package.json` props are
  `NodeEnv.getDependencies()` and `TypescriptMain.getCjsPackageJsonProps()`,
  called unbound: both return constants, so a workspace on the default env
  installs without loading Harmony;
- custom dependency detectors (the env's `getDepDetectors()` and the
  `registerDetector` hooks of `@teambit/dependency-resolver`'s `DetectorHook`)
  run in the host for the files the native scanner leaves to them.

`hostInfo` checks for these modules first. A Node.js CLI without them makes
native `install` decline before it writes anything, and the Node.js CLI runs
the install.

The repeat-install skip needs the dist directories and config files
`afterInstall` wrote. The host computes them itself, the way the compiler's
`ComponentCompiler.distDirs()` and the install aspect's `tryWriteConfigFiles`
do, so it works with any Node.js CLI that ships the modules above.

## Relation to the in-process integration

Earlier work ran Rust inside the Node.js CLI, through a `bit-workspace.node`
addon and spawned helpers, behind `BIT_RUST_*` and `BIT_NATIVE_INSTALL` flags.
That integration is removed: the crates are libraries of this CLI, and nothing
outside `native/`, the `Rust` workflow and these docs belongs to the Rust CLI.
The Node.js CLI is unchanged, so it is the complete fallback for every command.
