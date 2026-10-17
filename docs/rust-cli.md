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
   outside a workspace, or a yarn workspace. A declined command is delegated,
   and a warning on stderr names the command and the reason:
   ``⚠ bit-native: `status` runs on the Node.js CLI: <reason>``. Stdout stays
   the Node.js CLI's own. `--help` and `BIT_NATIVE_TRACE` (which prints the
   reason anyway) do not warn.
4. Everything else is delegated.

On Unix, delegation replaces the process image, so the Node.js CLI keeps the
PID, the terminal and signal handling. On Windows it runs as a child process.
The Rust process ignores Ctrl-C and exits with the child's exit code.

| Variable             | Effect                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `BIT_NATIVE=off`     | Delegate every command. Use it for A/B comparisons and bisecting.                        |
| `BIT_NATIVE_TRACE=1` | Print every dispatch decision and the delegated command line to stderr.                  |
| `BIT_NATIVE_QUIET=1` | Do not warn when a native command falls back to the Node.js CLI.                         |
| `BIT_NODE_CLI`       | Path of the Node.js CLI entry: `@teambit/bit`'s `bin/bit`, or a checkout's `bin/bit.js`. |
| `BIT_NODE_BINARY`    | The Node that runs the entry.                                                            |

## Finding the Node.js CLI

Discovery only inspects paths. It never downloads anything or runs Node. The
first match wins:

1. `BIT_NODE_CLI`.
2. `../node_modules/@teambit/bit/bin/bit` relative to the executable's
   directory. This is the bvm layout once bvm ships this binary as `bin/bit`.
3. The checkout the executable was built in: `<checkout>/bin/bit.js` when the
   executable is `<checkout>/native/target/<profile>/bit` and the checkout's
   dependencies are installed. A local build then runs with the Node.js CLI of its
   own commit, which its native commands reproduce (see [Versions](#versions)).
4. bvm's default link, `<bvm>/links/<DEFAULT_LINK>/node_modules/@teambit/bit/bin/bit`.
   The bvm directory is `BVM_GLOBALS_DIR`, else `%LOCALAPPDATA%\.bvm` on
   Windows, else `~/.bvm`.
5. A `bit` on `PATH` that is not this executable, typically bvm's wrapper script.

The entry runs with `BIT_NODE_BINARY`, else the newest Node in the bvm
directory the entry lives in, else `node` from `PATH`. That Node's directory
goes first on `PATH`, as bvm's wrapper does.

To try the binary against a checkout:

```sh
cd native && pnpm run build:debug
BIT_NODE_CLI=$PWD/../bin/bit.js ./target/debug/bit status
```

## Setup

`native/` is a pnpm project with Cargo support (`cargo.enabled` in its
`pnpm-workspace.yaml`), so the only prerequisite is pnpm 12.11 or later:

```sh
cd native
pnpm install          # the Rust toolchain rust-toolchain.toml names, and the crates
pnpm run build        # target/release/bit (build:debug for target/debug/bit)
```

`pnpm install` downloads the toolchain once per machine into pnpm's store,
verified against the Rust release signing key, and links it into
`native/.pnpm/rust`. It also vendors the crates into `native/.pnpm/crates`,
which `native/.cargo/config.toml` points Cargo at. `pnpm run` puts the linked
toolchain first on `PATH`, so building and testing need neither rustup nor a
system Rust.
`devEngines` in `native/package.json` pins the pnpm and Node.js versions, and
pnpm downloads them when they are missing.

| Script                      | Runs                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm run build`            | `cargo build --release -p bit-cli` (thin LTO)                               |
| `pnpm run build:dist`       | `cargo build --profile dist -p bit-cli` (fat LTO)                           |
| `pnpm run build:debug`      | `cargo build -p bit-cli`                                                    |
| `pnpm run test`             | `cargo test --workspace`                                                    |
| `pnpm run test:e2e`         | the ported e2e cases: `cargo test -p bit-cli --features e2e --test e2e`     |
| `pnpm run lint`             | `cargo clippy --workspace --all-targets --features bit-cli/e2e -- -D warnings` |
| `pnpm run doc`              | `cargo doc --workspace --no-deps`                                           |
| `pnpm run fmt`, `fmt:check` | pnpm's pinned rustfmt over the workspace                                    |

`build` uses thin LTO so an optimized rebuild stays fast. Binaries that are
shipped (bvm packages, release assets) must come from `build:dist`, which
writes `target/dist/bit` with fat LTO and one codegen unit: about 20% smaller
and a few percent faster, but a rebuild takes minutes and over 4 GB of memory.

Each Cargo script first runs `prepare-engine`, which writes a file that pnpm's
pinned engine crates expect but do not commit, into a local copy of that crate,
never into pnpm's store. Two checks still need rustup: `fmt` and `fmt:check`
build pnpm's pinned rustfmt fork with a dated nightly, and the perfectionist
lints (`cargo dylint`) use the nightly toolchain `cargo-dylint` installs.

`test:e2e` runs the cases of the Node.js CLI's e2e suite ported to the native CLI
([`native/plans/TEST_PORTING.md`](../native/plans/TEST_PORTING.md) tracks them).
They run the `bit` binary against the released Node.js CLI that
`native/cli/tests/e2e/bit-version` names, which `bvm install <version>` provides.

## The JavaScript host

Some behavior is still implemented by aspects in JavaScript, for example an
env's `getDependencies()` or the compile step after `bit install`. Native
commands reach it through `native/cli/src/host/host.js`. The script is embedded
in the binary and runs from a private `.cjs` temporary file on the Node.js CLI's
own Node, keeping the command line within Windows limits. The Rust session owns
and removes that file after the child stops. The host starts on the first call
only and loads modules that the published `@teambit/bit` package already ships.

The protocol is one JSON request per line on the script's stdin,
`{id, method, params}`, and one response per line on its stdout,
`{id, result}` or `{id, error}`. Output from aspects goes to stderr, so it
reaches the terminal without corrupting the protocol. Closing stdin ends the
script. A script that does not exit within five seconds is killed.

Each host method is removed once its behavior is ported to Rust.

## Native commands

| Command                                                                                                                           | Crate                                                                                                                                                                                                                                                                                                                     | Host methods                                                                                    | Declines when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `install`, `in`                                                                                                                   | `bit-install` ([details](rust/native-install.md))                                                                                                                                                                                                                                                                         | `hostInfo`, `envPolicy`, `appTypes`, `packageJsonProps`, `transformPackageJson`, `afterInstall` | `--help`, outside a workspace, non-UTF-8 arguments, the yarn package manager, a Node.js CLI found only as a wrapper script                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mini-status`, `ms`, with or without `--json`; `status --quick [--json]` | Rust status inventory, `bit-ignore` and shared scope/configuration readers | none | Component patterns and `--show-issues` on the private `mini-status` command, invalid arguments, unsafe paths, malformed legacy data or explicit inventory limits |
| `status --json`, `s -j`, and text output with warnings, verbose, strict, fail-on-error, expand, lanes and ignore-circular-dependencies flags | Shared Rust inventory, policy/configuration projection, repository comparison, dependency diagnostics and lane/history engines | Harmony environment policies, dependency detectors and custom load/issue callbacks; Intl ordering for tailored locales | Invalid arguments, unsafe or corrupt data, unavailable remote objects, explicit resource limits |
| `diff [component] [version] [to-version]` with JSON, name-only, stat, file, files-only, configs-only, parent, verbose or table output | Shared Rust status capture and repository engine, native patterns/state selectors, retained file/HTTP version import and Git diff | Permitted Harmony load/environment/detector callbacks and metadata presentation | Invalid selectors or arguments, unsafe/corrupt objects, unavailable remote objects and explicit resource limits |
| `log <id>` with default, `--json`, `--one-line`, `--parents`, `--full-hash`, `--full-message`, or `--show-hidden` | the engine’s `componentLog` follows validated Version parents from the current lane head or main head, preserves published BFS lane marking on divergent histories, and projects HEAD removal/deprecation ranges and staged deprecation; Rust formats and topologically orders merge graphs for `--parents` | none | `--remote`, a non-workspace component, missing or corrupt history objects, filtered-parent graphs for `--parents`, and unsupported flags |
| `log <scope>/<name> --remote` with default, `--json`, or `--one-line`; `--parents` for `file://` remotes | the Rust engine resolves HTTP and file remotes from workspace/global configuration; it queries bounded GraphQL history or reads validated bare-scope Component and Version objects, then formats the CLI views | none | HTTP `--parents` (the GraphQL projection has no parent hashes), active lanes on a file scope, unsupported flags, or invalid remote responses |
| `log-file <filepath>` with default or `--one-line` | the engine’s `componentFileHistory` validates local Version and Source objects; Rust selects file changes and renders the source CLI’s patch or table view | none | paths outside a bitmap component, binary sources, unavailable history, staged deprecation and unsupported flags |
| `blame <filepath>` with default or `--include-message` | the same validated file history request; Rust attributes changed lines by Version ancestry and renders the source CLI’s table | none | paths outside a bitmap component, binary sources, unavailable history, staged deprecation, and unsupported flags |
| `list`, `ls` with `-i`, `-j`, `-l`, `-s`, `-n`                                                                                    | the engine's `scopeList` (with the current lane's heads), the `.bitmap`                                                                                                                                                                                                                                                   | none                                                                                            | a remote scope, `--outdated`, `--include-deleted`, a lane missing from the index, namespaces with regular expression syntax other than `*` and `.`, and ids or locales outside the native collation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `import <ids or patterns...>` with `-x`, `-o`, `--override`, `--merge=manual\|ours\|theirs`, `-p <path>`, dependency/depth options, `--all-history`, `--fetch-deps`, `--json` and `--verbose`; current-lane scoped wildcard imports; `fetch -c [ids...] [--all-history]`; `fetch [main or tracked/scoped lanes...] --lanes [--all-history]` | Rust lists configured HTTP/file remotes, captures and validates object closures, main and lane history, resolves advanced remote Lane refreshes, and materializes new or tracked components with native three-way merge and directory selection. Retained policy completion updates workspace dependency ranges and conflict files with comment-preserving bytes before native installation. Lane fetches preserve main-first transfer and lane-first result ordering, including version-distinct bitmap seeds and parent Sources. JSON emits the released handler’s exact result without loader output | installation unless `-x` or `-o`; published semver grammar facts for workspace policy | unsupported flags, package-name or unscoped wildcard selectors, unsupported locale/package manager/layouts, unsafe or corrupt objects, missing remote IDs, unresolved local edits without a supported strategy, binary merge conflicts, active-lane `--fetch-deps`, and explicit resource limits. Advertised fetch JSON/from-original-scopes, tracking/write-dependents modes and unsupported plans decline before effects; started publication failures remain owned |
| `export [ids...]`, `e`, `--all`, `--all-versions`, `--head-only`, `--origin-directly`, `--resume <client-id>`, `--verbose`, `--json`, `--ignore-missing-artifacts`, `--fork-lane-new-scope`, `--eject`, `--open-browser` | Rust selects immutable object closures for main and current-lane exports, including local versions, full history, hidden updates, forked lanes, valid readmes, repeated exports, embedded scopes and published wildcard regular expressions. Retained Apply/Stage/Finalize receipts own remote transfer, acknowledged model/history/ref publication and bitmap/staged-control reconciliation. Default generated component packages use the shared Rust manifest renderer and linker, with their inputs validated before transfer. Resume reuses server pending objects without pushing them again. JSON preserves the released handler's ignored head-only/fork flags and its actual component/lane serialization | published providers, package and post-export callbacks; JSON class projection; optional eject and browser adapters | unknown flags or malformed input; explicit IDs on a lane and unsnapped readmes retain the released CLI's error stack through a decline before effects; cross-scope forks without the required flag and other unsupported plans decline before providers or transfer. After a transfer starts, failures remain owned and never delegate |
| `switch <lane>` with or without `-x`, `--skip-fetch`, and force strategies | the checkout engine’s prepare, plan, capture, materialization and apply path; native `bit-install` after the VCS commit when installation is requested | published provider and component hydration callbacks; compilation during installation | aliases, patterns, workspace-only switches, unsupported lane metadata, interactive conflicts, unsupported package managers, and anything the engine declines before writes |
| `checkout <to> [pattern]`, `U`, with `-x`, force/manual strategies, `--workspace-only`, and `head --include-new-from-scope` | shared Rust repository prepare/selection/capture/materialization/apply, including glob/list/negation/state/AND selectors, short snapshot refs with published Windows lookup errors preserved, ancestor/tag/main/lane targets, missing-file reset, root-component protection, dependency-policy updates/conflicts, canonical conflict errors, scope licenses, binary conflicts and new default-scope components; native installation after VCS publication | published Harmony providers and component onLoad callbacks; private source spools; build/installation tooling | interactive merge prompting, unsupported flags/transports/package managers, removed target Versions,; unavailable published adapters and unsafe/corrupt inputs decline before effects when eligible; after provider startup or a cache/publication prefix, errors remain native |
| `revert <pattern> <main\|version>` with or without `-x` | shared checkout target/ref resolution and native file materialization while retaining current bitmap/version; supports glob/list/negation/state/AND selectors, short refs, binary/CRLF contents, file removals, root components and local stored targets | the same published lifecycle and installation adapters as checkout | unsupported flags, transport/history cases and package managers; the same pre-effect boundaries as checkout |
| `reset [pattern]` with optional `--head`, `--force` and `--silent`; `reset --silent` with optional `--head`; `reset --soft <scope>/<name>` or `reset --soft --silent`; `reset --never-exported` | Rust selects local main-lane Version chains and linear lane snap chains, stopping at an exported lane's recorded remote head or resetting the entire lane chain when that component has no remote ref; glob/list/negation/state/AND selectors freeze a selected batch, including pending-deleted rows; it checks dependents for explicit resets and publishes Component/Lane objects, scope index and bitmap once per batch, including restoring snapped soft-deleted lane rows during batch reset; it reconciles pending VersionHistory and LaneHistory records and restores staged aspect config; soft reset clears pending bitmap tags; never-exported reset clears unscoped bitmap versions | none | interactive all-component confirmation, lane batches with inherited detached heads, complex lane histories, orphaned or non-linear local history beyond recorded detached heads, and unsupported flags |
| `merge [pattern]` with or without `-x`, `--build` | Rust selects glob/list/negation/state/AND predicates, captures once, performs three-way merge and policy publication, installs when requested, and resolves snapshots and dependent cascades after materialization | one retained published provider session supplies onLoad, dependency detection, pre-snap and builder callbacks; `force_local_build` follows workspace configuration | flags and package layouts outside the native grammar, interactive conflict selection, unsupported compositions/docs/app files, unavailable adapters, incomplete local history closure and unsafe/corrupt inputs; pre-effect CI errors requiring a JavaScript stack delegate; errors after effects remain owned |
| `merge [pattern] --resolve`, `-m` | Rust resolves pending file/config merges, preserves squash/unrelated ancestry and dependent cascades, publishes Versions and clears completed merge conflict state | published providers, hydration, pre-snap and optional builder callbacks | unsupported flags, selectors and package layouts, unavailable adapters and unsafe inputs before effects; callback/build failures preserve their published state prefix |
| `merge [pattern] --abort`, `lane merge-abort` | native recovery plans and restores workspace/lane controls, with interactive lane confirmation before restoration and callbacks | published component hydration after canonical restoration; installation/compilation when requested | complex component patterns, unparseable sources whose hashes do not prove a changed reset target, unsupported package managers and inputs the recovery engine declines before effects |
| `lane merge <lane> [pattern]` with or without `-x`, `--build`, `--resolve-unrelated [ours\|theirs]` | native graph divergence, three-way merge, hidden/model-backed targets, removal policy, component/workspace configuration updates and conflicts, lane/history publication and same-session automatic snapshots; preserves squash and unrelated relations | the same retained lifecycle and build adapters as component merge | unsupported lane flags/selectors/package layouts, unavailable adapters, direct `--no-snap` squashing errors requiring delegation before effects, and the component merge boundaries |
| `lane list` (including `--details`, `--json`, `--merged` and `--not-merged`), `lane current` (including `--json`), `lane show [local-lane]` (including `--json`), `lane list --remote <scope>`, `lane show <lane> --remote` | the engine's `laneList` and `scopeList`, `.bitmap` and `scope.json`, including visible components, hidden update-dependents, readme metadata and main-head ancestry for merge filters; `lane current` reads only `.bitmap` and `scope.json`; `lane list --remote <scope>` and `lane show <lane> --remote` inspect configured bare `file://` scopes with validated Lane and ancestry objects, or configured HTTP scopes through their limited GraphQL lane projection | none | unconfigured remotes, remote inspection outside a workspace, lanes Node migrates to record deleted components (schema before `1.0.0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lane create <name>` with `--scope`, `--alias`, and `--fork-lane-new-scope` | Rust writes the Lane and LaneHistory objects, index, scope tracking and bitmap for main and lane forks; native status inherits exported parent refs for new forks | user identity from the existing global/workspace configuration reader | locally staged main versions, unsupported flags or names, and parent metadata the native planner declines before writing |
| `remove <component> --silent`, `rm <component> --silent`, with optional `--keep-files` and `--force` for versioned components | Rust untracks clean new, staged tagged and imported mainline components, plus new components and linear snap chains on an unexported current lane. Without `--force`, native status confirms a versioned component is unmodified. Mainline versioned removal deletes Component and Version objects; lane snap removal deletes the Component model, clears the staged lane entry, updates the Lane object, retains its snaps, and preserves or creates the matching VersionHistory. All paths update the scope index and bitmap history, remove the generated package, and delete component files unless kept | none | modified versioned components without `--force`; configured components; versioned components with a missing main file, unsupported model state or staged config; non-linear snap ancestry or divergent VersionHistory; exported or multiple indexed lanes; overlapping roots; interactive confirmation, patterns and other flags; unsupported paths decline before writes |
| `delete <component> --silent` with optional `--range <range>` or `--snaps <current-hash>`; `--lane` for exported lanes | Rust validates mainline or exported-lane heads, updates bitmap remove config and history, and preserves scope objects/index. Whole-component deletion removes the generated package and source directory; range and selected-snap deletion keep both. Full exported-lane deletion captures workspace dependencies in Rust and pins deleted dependencies to their latest main tag through the shared comment-preserving policy editor; it revalidates the capture before writes | none | new or unexported-lane components, lane ranges, lane dependency graphs containing components outside the captured workspace, non-current snap selection, existing bitmap configuration, missing main files or objects, unsafe paths, patterns, confirmation, hard deletion, `--update-main`, and other flags decline before writes |
| `recover <component>` with optional `-x` | Rust validates a locally soft-deleted tagged, snapped, or imported mainline or exported-lane component, reads verified Component, Version, and Source objects, restores absent source files for a whole-component deletion or validates retained clean files for a range/snap selection, clears the bitmap remove config, and records bitmap history | none | remote-only recovery, new or unexported-lane components, modified retained sources, existing recovery destinations, missing or corrupt scope objects, unsupported configuration, patterns and other flags decline before writes |
| `lane remove <lanes...> --silent` with optional `--force` | Rust selects local lanes, checks merged state unless forced, validates every Lane object, moves selected Lane objects to the scope trash and removes their scope-index entries | none | interactive confirmation, remote lane deletion, ambiguous names, unsupported lane schemas, or a failed preflight |
| `lane import <scope>/<name> -x` | on main, the native switch plan fetches and materializes the lane; on an active lane, `commandInboundPrepare` fetches the remote Lane and component closure from configured file or HTTP scopes, then `commandInboundApply` publishes the Lane, index and refs without changing the workspace files or bitmap | none | unscoped names, partial patterns, unsupported flags, anything the engine declines before writing |
| `lane history [name]` with `--json` and `--id`; `lane alias <name> <alias>`; `lane rename <name>`; `lane change-scope <scope>` | `bit-object-import` validated local LaneHistory and lane metadata publication | none | remote-only or unsupported lane history, unsupported flags, or metadata changes outside a current unexported lane; these decline to Node before writes |
| `snap [pattern]` | native selection and dependent cascade; source and graph hashes, Version/model objects, parents and history, refs/index and local publication; workspace-root snapshots; generated packages and source links | published aspect/environment hooks, issue callbacks, editor, builder and package transformers; source bodies use private file spools | unsupported option syntax, malformed or over-budget receipts, corrupt repository inputs and unavailable published adapter modules decline before effects; after extension startup or publication, failures remain native |
| `tag [patterns...]`, `t` | snapshot publication plus semantic versions, versions files, soft tags and persistence, registry-version retries, state/glob selectors, issue policies, graph rebuild/omission and workspace-root provenance | the same extension callbacks as snap; registry availability facts | tagging on lanes, invalid editor combinations and Node-unsupported soft premajor/preminor/prepatch persistence retain canonical validation |

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
- **Issues.** The supported issue classes, including dependencies on locally removed components, are formatted like `IssuesList.toObjectIncludeDataAsString()`, with cycles found by Tarjan's algorithm.
- **Bitmap state.** Local-only, soft-tagged, locally soft-removed, and remotely soft-removed components are included in native JSON and text status reports. A scoped component with no local model is reported as pending import and invalid, matching Node's two result sections.
- **Fresh detection.** The default dev-file patterns, as `minimatch` 3.0.5 matches them; the core aspect packages from `scopes/harmony/bit/core-aspect-ids.json`; the bundled TypeScript version, read from the Node.js CLI's install. Node's built-in module list comes from the Node.js CLI's own Node. It is asked once per binary and cached in `<BIT_GLOBALS_DIR>/native-cli`.
- **Dependency cache.** Fresh detections are written with `cacache`'s format once the command has validated them, after the invalidation check `FsCache` runs.
- **Ordering.** Result rows are sorted like `localeCompare` sorts them under the root collation.
- **Current lane.** The engine uses the lane's component heads for version comparisons and its remote refs for staged status. Components outside the lane keep their main heads. Bitmap rows unavailable on the current lane are excluded from ordinary and quick status; on main, rows with a model head appear under `unavailableOnMain` in JSON and text status. Empty, unexported and exported ordinary lanes are supported. With `--lanes`, Rust fetches current main history into a retained import, computes pending main updates, then publishes the fetched objects after status preflight. Forked lanes also fetch their parent lane and report updates from its remote head. Soft-deleted lane components, stale remote refs left by physical removal, and hidden lane update-dependents are supported. Hidden update-dependents appear separately from staged workspace components in JSON and text status.

### Diff output

`diff --json` follows `rust-diff.ts` and `rust-diff-metadata.ts`, and formats like `@teambit/legacy.component-diff`:

- **File diffs.** The engine runs `git diff`. The CLI relabels the headers like `formatFileDiff`, including JavaScript's `$` replacement patterns in file names.
- **Lane baseline.** On a current lane, the bitmap's lane version is the baseline for file and metadata comparisons, including changes made after a local snap.
- **Metadata.** `diffMetadata` is ported field by field. That covers `object-diff` and `array-difference` for the printable fields, `ComponentID` equality for dependencies, and npm `semver` loose comparison through `node-semver`'s `npm` module. Extension configurations are written to temporary files and compared with `git diff --no-index --color`, as `getOneFileDiff` does.
- **Colors.** Metadata text is colored like chalk 4.1.2 when `supports-color` 7.2.0 would color stdout: flags such as `--no-color`, `FORCE_COLOR`, a terminal, `TERM`, CI variables.
- **Dependency cache bypass.** With `BIT_FEATURES=no-fs-cache`, native status, diff and workspace commands detect dependencies afresh and validate their read set before committing, without reading, deleting or writing the dependency cache. Other documented fallback boundaries still apply.
- **File order.** A component's files follow the published `globby` filesystem walk: each directory's entries use libuv's byte ordering, while independent directory batches can complete in different orders. Platform-specific path separators and loader ordering are qualified against the published CLI on Windows too.

The Node.js CLI reports rows in a varying order, since components are processed concurrently. The native order is the bitmap's.

### Import

`bit import <component-patterns...>` follows `ImportComponents.importSpecificComponents`:

1. **Selection.** Each wildcard pattern is listed on its remote with the GraphQL query `Http.list()` sends, matched by the remote. Deprecated components are left out unless `--include-deprecated` is given. The ids are sorted like `sortListScopeResults` sorts them, `localeCompare` on the full id.
2. **Transfer.** The engine fetches the selected ids with their dependencies. A dependency of another scope is taken from the dependent's remote, which serves it from its cache, and merged as not from its origin, as `mergeOne` does.
3. **Write.** Component directories are fixed like `fixDirsIfEqual` and `fixDirsIfNested` fix them, so `webhooks` moves to `webhooks_1` when `webhooks/exceptions/...` is imported too. The bitmap is sorted by key.
4. **Install.** Unless `-x` is given, the install runs with the options `installPackagesGracefully` passes: dedupe, no import, config files unless `--skip-write-config-files`, and the stored dependency graphs when the `deps-graph` feature is on. The compile runs inside the install, so the second compile `compileGracefully` starts is not repeated. An installation error is reported in the import report, as `installationErrorOutput` formats it.

Outside Linux the engine writes `.bit/index.json` in place, as `fs.writeJson` does, so the file keeps its owner, mode, ACL and extended attributes. On Linux it replaces the file and copies them.

HTTP requests carry `User-Agent: node-fetch`, the default of `@pnpm/node-fetch`. bit.cloud answers requests without a `User-Agent` with a 403 challenge page.

### Transfer ownership

Fetch responses stream through a bounded channel into the Rust tar reader. The engine validates
object hashes and the stream terminator before publishing received objects. Authentication,
proxy and TLS settings use the effective global, scope, workspace and environment configuration;
HTTP clients support client certificates and keys. Transport cancellation belongs to the calling
session and closes pending HTTP requests without reverting an acknowledged remote write.

Export retains one operation through remote acknowledgement, local model/history updates,
package linking and final bitmap reconciliation. Configured Harmony providers, package callbacks,
post-export hooks and class metadata run through the installed published CLI adapter. Component
Source bodies stay in Rust. During remote communication, Ctrl+C warns and permits publication
to finish, as `ExportMain` does; the previous signal handler is restored afterward. A failure after
remote communication belongs to the native command and never delegates a second export.

Release qualification against Node 22.22.0 / Bit 2.2.94 verified 105 fresh-copy pairs across seven
transfer workloads in non-TTY, real TTY and CI modes, including generated package bytes and links.
The six workloads without configured callbacks measured 2.1–27× lower complete-command medians.
Configured callbacks measured 653 ms versus Node's 682 ms off a terminal, 653 ms versus 673 ms in
CI, and 669 ms versus 677 ms on a TTY. An earlier full run had effectively tied callback TTY medians. These are local fixture measurements;
the actual Harmony/extension bootstrap dominates the callback path. The
[complete samples and fingerprints](../scripts/rust/benchmarks/transfer.json) include both slower
intermediate implementations and the final artifact. Reproduce the fixtures with
`scripts/rust/prepare-transfer-benchmark.py` and measure all seven with
`scripts/rust/bench-transfer-suite.py`; both require disposable remotes.

### Write commands

Write commands keep two phases. Until the commit starts, any failure declines, and the Node.js CLI runs the command from scratch. That covers an engine decline, a report that cannot be formatted and a progress receipt that does not validate. After the commit starts, failures belong to the command. They are printed in red on stderr, the command history records them, and the exit code is 1, as the Node.js CLI's error handler does.

`checkout`, `switch` and `merge` print Bit's loader lines on stdout like `ora` 5.4.1 off a terminal (`- <text>`, `✔ <text>`), with timings in `pretty-time`'s format. The reports are ported from `checkoutOutput`, `mergeReport` and the `merge-output` helpers. Details hidden behind `bit details` are written to `<BIT_GLOBALS_DIR>/last-command-details` as `CommandRunner` writes them.

`revert` uses the checkout planner's `revert` mode, so modified files are replaced without a three-way merge and bitmap versions are preserved. `scripts/rust/revert-parity.py` compares six complete Node/native commands on fresh copies, including modified files, a no-op, `main`, all components, and installation. The fixture fingerprint was `0d500c328bb45652db0114acda4a5c9d1677143c022da7abc2451e9397702542`; all six matched exit status, component files, bitmap, and stable report text. Five alternating fresh-copy `revert alpha 1.0.0 -x` runs measured a 392.028 ms Node median and 30.098 ms Rust debug median on this fixture. These are local complete-command results, not a release-build or cross-platform speedup claim.

`switch` resolves local and supported remote lane heads before planning, reuses checkout's file materialization, and publishes the lane header and component visibility in the bitmap after the files. `--force-ours` and `--force-theirs` use the checkout conflict strategy. Tracked hidden components are selected again when the destination carries them. Without `-x`, the native installer runs after the VCS commit and the JavaScript host performs aspect compilation.

When a merge changes configuration, the engine asks for the built-in Node environment's defaults, which are constants of the environment (`commandDefaultNodeReceipt`), and for a dependency detection of the merged files.

When a merge, `bit snap` or `bit tag` writes versions, the CLI supplies what the engine cannot know (`commandSnapshotReceipt`, `resolveSnapshotReceipt`):

- **Snapshot identity.** New snap hashes (`newSnapHash`: the SHA-1 of a random UUID v4) and a batch id.
- **Log.** Identity is cached for the process as published `getIdentity()` does; every log gets a fresh date. The username comes from Bit Cloud's `/user` endpoint when a `user.token` is configured, else from `user.name`. The email comes from `user.email`. Both follow `getConfig`: environment, workspace, scope and global config, then `git config --list`.
- **Bit version.** The version of the `@teambit/bit` package the Node.js CLI runs from.
- **Dependency graph.** Each snapped component's `DependenciesGraph` (`calcDependenciesGraph`), cut from `pnpm-lock.yaml`. The lockfile is read and filtered by pnpm's `pnpm-lockfile` crate, the code `@pnpm/napi` runs for the Node.js CLI. The filtered package and snapshot order follows pnpm's importer-root, depth-first walker; object hashes depend on this order. Workspace components are named by their versions (`createFileVersionReplacer`): the snapped ones by their new hashes as `0.0.0-<hash>`, the others by their workspace versions. The engine stores the graph as a Source and sets `dependenciesGraphRef`.

A merge uses one authoritative capture and native merge plan. It materializes files
and policy changes, runs installation unless `-x` was requested, and then resolves
pending snapshots through the retained provider session. The snapshot phase reads
the newly materialized workspace without replaying providers; native Version and
graph publication preserves squash/unrelated ancestry and dependent snap cascades.
Reports use the hashes actually committed. Snapshot errors are included in the
merge report while preserving the canonical materialization/build prefix.

Removal follows the published action: a fast-forward removed target can remove
its workspace entry immediately, while a diverged or forced no-snap merge retains
pending removal until snapshot resolution. Recovery restores lane controls before
hydration callbacks and keeps the same restored prefix when a callback fails.

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
`scripts/rust/check-scope.sh` keeps it that way: the `Rust scope` workflow fails a
change outside those paths, or one that brings back the napi addon or a helper
binary. Agents working in `native/` follow `native/AGENTS.md`.
