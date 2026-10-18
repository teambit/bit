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

`bit-workspace-config` supplies the shared comment-preserving JSONC document, scope and
workspace discovery, global config paths/readers, environment-key mapping and store layering.
Installation, status/diff, snapshot/checkout/merge, transfer, provisioning and diagnostics reuse
these readers and renderers; repository object reads use the bounded Rust object reader.
Prepared scope documents share the published four-space/no-final-newline serializer, and package
manifest edits share the existing newline, indentation and field-order formatter.

Configuration lookup gives nonempty `BIT_CONFIG_*` values precedence over workspace, scope and
global stores. Lists retain stored values and omit environment overrides. The native config
command preserves the published origin order, including global-first deletion when no origin
is given, JSON/text rendering, comment-preserving workspace backups and private global-file
permissions. It also retains the released non-string and inherited-property getter behavior.

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
| `init [path]`, `--bare [name]`, naming/default-directory/default-scope/generator options, `--shared`, `--standalone`, package-manager and reset options, `--agent` | `bit-cli`, `bit-workspace-config`: provisioning and repair/reset plans, scope selection, permissions, package/configuration rendering, agent instructions and MCP | Published package templates and instruction assets are read as files; no ordinary Harmony host | Fresh Git initialization requiring the interactive wizard, malformed workspace configuration, unavailable published assets, unsupported syntax or paths decline before effects; started filesystem failures remain owned |
| `config`, `config get/set/del/list`, `--local`, `--local-track`, `--origin`, `--detailed`, list `--json` | `bit-cli`, `bit-workspace-config`: store precedence, native persistence, JSON/text/color reports and workspace history | none; Git supplies the released user-name/email fallback | Unknown grammar/origins, unavailable stores, malformed or unsupported store shapes, versioned workspace config-store mutations and `__proto__` mutations decline before effects; write failures remain owned |
| `add [paths...]`, `a`, identity/namespace/scope/main/env options, `--override`, `--root`, and `--json` | Rust resolves selectors and ignores, validates ownership and main files, retains a projected bitmap, prepares component package links and publishes bitmap history only after linking succeeds | Published environment resolution, component-load and package transformers, and bounded remote-existence facts; source inventory, tracking decisions and persistence remain native | Unknown grammar, unscoped vendor components, unsafe or unsupported filesystem/model/configuration inputs and explicit resource limits decline before effects; provider or link failures after ownership remain native errors |
| `stash save` / `s`, `list`, `load [stash-id]` / `pop`, messages, `--include-new`, manual/ours/theirs merge and force options | Rust detached Version/Source capture, dependency graphs, retained stash storage, checkout and batch cleanup | Permitted environment/load/dependency facts and component-add/compile callbacks | Unknown grammar, the published boolean pattern option and empty-message conversion, unsafe/corrupt metadata, missing/re-added tracked components or paths requiring canonical recovery, unavailable dependency objects and explicit resource limits; declines precede publication |
| `doctor [diagnosis]`, `--list`, `--json`, `--save`, `--archive`, archive inclusion/exclusion flags, `--remote` | `bit-cli`, `bit-workspace-config`, `bit-object-import`, `bit-client-transfer`: eight built-in diagnoses, reports/archives and file/HTTP remote diagnostics | Published BVM latest-version fact and configured JavaScript remote resolvers | Unknown grammar, unavailable published metadata, stores requiring canonical repair, corrupt or over-budget objects and error presentations requiring the released CLI stack decline before effects |
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
| `checkout <to> [pattern]`, `U`, with `-x`, force/manual strategies, `--workspace-only`, and `head --include-new-from-scope` | shared Rust repository prepare/selection/capture/materialization/apply, including glob/list/negation/state/AND selectors, short snapshot refs with published numeric positional coercion and Windows lookup errors preserved, ancestor/tag/main/lane targets, missing-file reset, root-component protection, dependency-policy updates/conflicts, canonical conflict errors, scope licenses, binary conflicts and new default-scope components; native installation after VCS publication | published Harmony providers and component onLoad callbacks; private source spools; build/installation tooling | interactive merge prompting, unsupported flags/transports/package managers, removed target Versions; unavailable published adapters and unsafe/corrupt inputs decline before effects when eligible; after provider startup or a cache/publication prefix, errors remain native |
| `revert <pattern> <main\|version>` with or without `-x` | shared checkout target/ref resolution and native file materialization while retaining current bitmap/version; supports glob/list/negation/state/AND selectors, short refs with published numeric positional coercion, binary/CRLF contents, file removals, root components and local stored targets | the same published lifecycle and installation adapters as checkout | unsupported flags, transport/history cases and package managers; the same pre-effect boundaries as checkout |
| `reset [pattern]` with optional `--head`, `--force` and `--silent`; `reset --silent` with optional `--head`; `reset --soft <scope>/<name>` or `reset --soft --silent`; `reset --never-exported` | Rust selects local main-lane Version chains and linear lane snap chains, stopping at an exported lane's recorded remote head or resetting the entire lane chain when that component has no remote ref; glob/list/negation/state/AND selectors freeze a selected batch, including pending-deleted rows; it checks dependents for explicit resets and publishes Component/Lane objects, scope index and bitmap once per batch, including restoring snapped soft-deleted lane rows during batch reset; it reconciles pending VersionHistory and LaneHistory records and restores staged aspect config; soft reset clears pending bitmap tags; never-exported reset clears unscoped bitmap versions | none | interactive all-component confirmation, lane batches with inherited detached heads, complex lane histories, orphaned or non-linear local history beyond recorded detached heads, and unsupported flags |
| `merge [pattern]` with or without `-x`, `--build` | Rust selects glob/list/negation/state/AND predicates, captures once, performs three-way merge and policy publication, installs when requested, and resolves snapshots and dependent cascades after materialization | one retained published provider session supplies onLoad, dependency detection, pre-snap and builder callbacks; `force_local_build` follows workspace configuration | flags and package layouts outside the native grammar, interactive conflict selection, unsupported compositions/docs/app files, unavailable adapters, incomplete local history closure and unsafe/corrupt inputs; pre-effect CI errors requiring a JavaScript stack delegate; errors after effects remain owned |
| `merge [pattern] --resolve`, `-m` | Rust resolves pending file/config merges, preserves squash/unrelated ancestry and dependent cascades, publishes Versions and clears completed merge conflict state | published providers, hydration, pre-snap and optional builder callbacks | unsupported flags, selectors and package layouts, unavailable adapters and unsafe inputs before effects; callback/build failures preserve their published state prefix |
| `merge [pattern] --abort`, `lane merge-abort` | native recovery plans and restores workspace/lane controls, with interactive lane confirmation before restoration and callbacks | published component hydration after canonical restoration; installation/compilation when requested | complex component patterns, unparseable sources whose hashes do not prove a changed reset target, unsupported package managers and inputs the recovery engine declines before effects |
| `lane merge <lane> [pattern]` with or without `-x`, `--build`, `--resolve-unrelated [ours\|theirs]` | native graph divergence, three-way merge, hidden/model-backed targets, removal policy, component/workspace configuration updates and conflicts, lane/history publication and same-session automatic snapshots; preserves squash and unrelated relations | the same retained lifecycle and build adapters as component merge | unsupported lane flags/selectors/package layouts, unavailable adapters, direct `--no-snap` squashing errors requiring delegation before effects, and the component merge boundaries |
| `lane list` (including `--details`, `--json`, `--merged` and `--not-merged`), `lane current` (including `--json`), `lane show [local-lane]` (including `--json`), `lane list --remote <scope>`, `lane show <lane> --remote` | the engine's `laneList` and `scopeList`, `.bitmap` and `scope.json`, including visible components, hidden update-dependents, readme metadata and main-head ancestry for merge filters; `lane current` reads only `.bitmap` and `scope.json`; `lane list --remote <scope>` and `lane show <lane> --remote` inspect configured bare `file://` scopes with validated Lane and ancestry objects, or configured HTTP scopes through their limited GraphQL lane projection | none | unconfigured remotes, remote inspection outside a workspace, lanes Node migrates to record deleted components (schema before `1.0.0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lane create <name>` with `--scope`, `--alias`, and `--fork-lane-new-scope` | Rust writes the Lane and LaneHistory objects, index, scope tracking and bitmap for main and lane forks; native status inherits exported parent refs for new forks | user identity from the existing global/workspace configuration reader | locally staged main versions, unsupported flags or names, and parent metadata the native planner declines before writing |
| `move <from> <to>`, `mv` | native source relocation or reconciliation of an already moved directory; retained source/control proofs, projected bitmap paths, generated packages, source links and bitmap history | retained published providers, component onLoad callbacks and package transformers | unknown grammar, paths outside the workspace, unsafe filesystem layouts and unsupported inputs decline before provider startup; CI validation errors requiring a JavaScript stack delegate before effects |
| `rename <source> <target>` with `--scope`, `--path`, `--refactor`, `--preserve`, `--ast`, `--delete` or `--deprecate` | native identity selection, source/path and import refactoring, new-component rename or exported-component copy with source deletion/deprecation, component aspect/env references, package links and bitmap history | retained published onLoad and package callbacks; actual registered onComponentAdd/compiler hooks; the published TypeScript transformer for `--ast`, using private file spools | unknown flags, non-workspace execution, unsafe paths, unsupported metadata or bounded-input limits |
| `scope rename <old> <new>` with `--refactor`, `--preserve`, `--deprecate`, `-x`; `scope rename-owner <old> <new>` with `--refactor` or `--ast` | native batch selection, default-scope/config and bitmap publication, exported replacement/deletion/deprecation, source and package-import refactoring, package linking and history; optional native installation followed by compilation | actual per-component environment, onLoad, onComponentAdd, package and compiler hooks in a retained session; owner rename preserves paths and the pinned CLI ignores its advertised `--ast` flag | unknown grammar, unsafe paths, unsupported metadata or bounded inputs; other scope subcommands still delegate |
| `fork <source-or-pattern> [target]` with `--scope`, `--path`, `--env`, `--refactor`, `--skip-config`, `--preserve`, `--no-link`, `--ast`, `-x`; `scope fork <source-scope> [target-scope] [pattern]` with `--ast`, `-x` | Rust owns retained selection, private remote capture, source/refactor materialization, tracking, provenance and dependency-policy writes. All 34 strict local, file/HTTP remote, batch, callback, installation and failure-prefix fixtures pass; the 14 original fork and three scope-fork assertions are mapped individually. Complete Linux qualification passes 360 comparison pairs and all 70 eligible native medians are lower; see the fork qualification below | actual environment/onLoad, onComponentAdd, package/compiler and TypeScript AST tooling; native installation for remote forks when requested | non-UTF-8/unsupported grammar, missing workspace, unsupported inventory or unsafe preflight plans, and requested historical versions of tracked workspace components decline before providers. Once providers or mutation begin, errors stay owned. Scope-fork and remote-pattern option forwarding preserves the published handler’s behavior; single-fork flags are not assumed to apply to every batch |
| `deprecate <pattern>`, `d`, with `--new-id` or `--range`; `undeprecate <pattern>` | native bitmap deprecation updates, stored Version deprecation/range lookup, replacement identity validation, unchanged-result reporting and bitmap history; local glob/list/negation selectors and `$deprecated` | retained published providers and component hydration | other state selectors, remote-only replacement IDs, unknown options and unsafe/corrupt inputs decline before effects; CI validation errors requiring a JavaScript stack delegate |
| `remove <pattern> --silent`, `rm`, with `--keep-files`, `--force` and `--track` | native batch selection and repository/bitmap publication, including staged models, current lanes, retained configuration and unmerged-state cleanup; source/package removal preserves partial failures and unrelated objects. Workspace state filters load classes only when their predicate requires them; later status checks reuse those classes | actual retained providers, environment/onLoad/package callbacks and dependency metadata | interactive confirmation, remote removal, unknown grammar, overlapping/unsafe paths, corrupt or unsupported metadata and explicit resource limits; eligibility declines before effects, while started failures remain owned |
| `delete <pattern> --silent`, `--range`, `--snaps`, `--lane`, `--update-main` | native soft-deletion selection, configuration and bitmap history, main/lane removal policy, dependency-range updates, package/source cleanup and nested empty-parent cleanup. Ordered workspace state filters share retained classes and status inputs | actual retained providers and component/package callbacks | hard deletion, interactive confirmation, unsupported lane/model/configuration states, unsafe paths, unavailable object closures and unknown grammar; started failures remain owned |
| `recover <pattern>`, `-x` / `--skip-dependency-installation`, `--skip-write-config-files` | native grouped recovery, bitmap/component configuration, local or remote object capture, stored removal-range classification, source restoration/overwrite and complete history publication. Cached staged models retain native divergence history; missing local models preserve the canonical objects-only import prefix | actual providers/component metadata and the existing import installation/configuration adapters | workspace-only state filters, unknown flags, new/unsupported lane or model states, unsafe paths, corrupt objects and explicit resource limits; failures after capture/publication remain owned |
| `lane remove <lanes...> --silent` with optional `--force` | Rust selects local lanes, checks merged state unless forced, validates every Lane object, moves selected Lane objects to the scope trash and removes their scope-index entries | none | interactive confirmation, remote lane deletion, ambiguous names, unsupported lane schemas, or a failed preflight |
| `lane import <scope>/<name> -x` | on main, the native switch plan fetches and materializes the lane; on an active lane, `commandInboundPrepare` fetches the remote Lane and component closure from configured file or HTTP scopes, then `commandInboundApply` publishes the Lane, index and refs without changing the workspace files or bitmap | none | unscoped names, partial patterns, unsupported flags, anything the engine declines before writing |
| `lane history [name]` with `--json` and `--id`; `lane alias <name> <alias>`; `lane rename <name>`; `lane change-scope <scope>` | `bit-object-import` validated local LaneHistory and lane metadata publication | none | remote-only or unsupported lane history, unsupported flags, or metadata changes outside a current unexported lane; these decline to Node before writes |
| `snap [pattern]` | native selection and dependent cascade; source and graph hashes, Version/model objects, parents and history, refs/index and local publication; workspace-root snapshots; generated packages and source links | published aspect/environment hooks, issue callbacks, editor, builder and package transformers; source bodies use private file spools | unsupported option syntax, malformed or over-budget receipts, corrupt repository inputs and unavailable published adapter modules decline before effects; after extension startup or publication, failures remain native |
| `tag [patterns...]`, `t` | snapshot publication plus semantic versions, versions files, soft tags and persistence, registry-version retries, state/glob selectors, issue policies, graph rebuild/omission and workspace-root provenance | the same extension callbacks as snap; registry availability facts | tagging on lanes, invalid editor combinations and Node-unsupported soft premajor/preminor/prepatch persistence retain canonical validation |

Fork parity fixtures align released/native command launches to the same 50–100 ms wall-clock phase. Functional multi-copy fixtures additionally configure a physically compiled Node-composed environment through component-name variants, whose real onComponentAdd slot waits at least 1,100 ms after every target copy, separating second-resolution bitmap backups through the real callback lifecycle. The environment uses a separate fixture.tools scope outside source selectors. Per-target environment loading guarantees registration even for late-registered scope subcommands that do not bootstrap root-only providers; fixtures assert the real callback receipt exists. Clocks, backup bodies, counts and reasons remain unchanged and strictly compared. Single-copy fixtures use no callback barrier; benchmark fixtures and timings are unchanged.

`confirm` prompts are asked by the Rust process itself, since it owns the terminal.

Native commands append to the workspace's `command-history` file (in `.bit`,
or `.git/bit`) as the Node.js CLI does. A declined command writes nothing, so
the Node.js CLI's own lines are not duplicated.

### Component and scope fork qualification

The [complete fork qualification](../scripts/rust/benchmarks/fork-planning-reuse-qualification.json)
measures source `4799396e8131b5c9e6c05cc440d014d598f05a7c` against Node 22.22.0 /
Bit 2.2.94. Its native-source SHA-256 is
`93b0889c80289bf790342910cbfb9cb35147f880a9788f33dcb163254f64c0af` and release-binary
SHA-256 is `cde14ad3e9e44e3a08d1d19d6c84d464c34fa07108f9f1d6c8908b3bf386316c`.
Five alternating fresh-copy pairs per non-TTY, CI and TTY mode pass all 360
output, exit-code, source, control, cache, object, history, mode and link comparisons
across 24 workloads. Of those pairs, 350 run natively; ten add CI error pairs
intentionally delegate and are excluded from native speed claims. All 70 eligible
native workload/mode medians are lower. Non-TTY fork medians in milliseconds are:

| Workload | Node | Rust |
| --- | ---: | ---: |
| Local fork, 11 source files | 541.434 | 472.238 |
| Local fork with dependent refactoring | 570.569 | 461.985 |
| Local fork, ten components | 881.900 | 798.708 |
| File-remote fork, 11 source files | 567.404 | 470.154 |
| File-remote fork, ten components | 686.725 | 541.130 |
| Scope fork, ten components | 864.747 | 733.166 |

The [fork samples](../scripts/rust/benchmarks/fork-planning-reuse.json),
[identity](../scripts/rust/benchmarks/fork-planning-reuse-identity.json),
[add](../scripts/rust/benchmarks/fork-planning-reuse-add.json),
[mutation](../scripts/rust/benchmarks/fork-planning-reuse-mutation.json) and
[status/checkout/export](../scripts/rust/benchmarks/fork-planning-reuse-regressions.json)
reports retain every sample. Each complete workload qualified on its first attempt
after 20 consecutive seconds below 30% aggregate CPU, with a closed 0.5-second
monitor staying below 80%. The archive embeds the driver, raw CPU counters,
helper fingerprints and immutable source identity. These are controlled warm-metadata
Linux file-remote results; HTTP behavior has functional coverage, without a network
or cross-platform performance claim.

The [earlier fork baseline](../scripts/rust/benchmarks/fork-completion-qualification.json)
remains unchanged: all 360 correctness pairs passed, but scope rename CI measured
1021.802 ms in Rust versus 1014.847 ms in Node. The changed source reuses lazy
package matchers across generic planning phases and combines added-component cache
seeding with the following on-add host request. The new scope rename CI median is
1014.069 ms versus Node's 1041.988 ms; this small difference should not be treated
as a broad speedup claim. All earlier mutation archives remain unchanged too.

### Component identity and location

`move`, component `rename`, `deprecate` and `undeprecate` keep workspace mutation in Rust. Their planners retain the original bitmap and relevant source/configuration inputs, validate paths before materialization, and publish bitmap history through the shared native writer. Moving a directory does not change its component identity. Renaming an exported component creates a new component and either deletes or deprecates the source; it does not rewrite previously published Versions.

Configured providers load before the authoritative mutation plan. A retained Harmony session supplies actual component classes, onLoad metadata, package transformations, onComponentAdd hooks and compiler tooling. Rust owns inventory, refactoring, file writes, package/link publication and bitmap changes. AST refactoring calls the published transformer on private source files rather than delegating the rename command. In-memory onLoad source changes are retained for the exported-component copy, while an unversioned rename follows the published target reload.

Unknown grammar and unsupported inputs delegate only before provider startup or another observable prefix. Once providers, caches, links or source publication have produced effects, failures remain owned by the native command. These operations preserve partial publication and callback output rather than rerunning the command through Node.

The Linux release measurements in [`identity.json`](../scripts/rust/benchmarks/identity.json)
measure source `50ac1ea7c` against Node 22.22.0 / Bit 2.2.94. Subsequent Windows
fixture and doctor diagnostic changes affect tests only; production sources and
the measured release binary are unchanged. Five alternating pairs
per non-TTY, CI and TTY mode passed all 75 output, filesystem, cache, history and
file-remote comparisons. Non-TTY medians in milliseconds were:

| Workload | Node | Rust |
| --- | ---: | ---: |
| Move 11 source files | 447.463 | 301.373 |
| Deprecate 100 tagged components | 299.932 | 262.639 |
| Rename a new component with 11 files | 549.241 | 521.201 |
| Rename an exported component with deprecation | 597.438 | 562.636 |
| Rename an exported component with dependent refactoring | 614.769 | 543.997 |

All fifteen native identity medians were faster. Another 90 add pairs in
[`identity-add-regressions.json`](../scripts/rust/benchmarks/identity-add-regressions.json)
and 45 status/checkout/export pairs in
[`identity-regressions.json`](../scripts/rust/benchmarks/identity-regressions.json)
passed on the same source and binary; all 40 native workload/mode medians were
faster. Ten intentionally delegated CI error pairs are excluded from native speed
claims. Each complete workload was independently monitored after 20 consecutive
seconds below 30% host CPU use, with a closed 0.5-second monitor staying below 80%.
The [qualification evidence](../scripts/rust/benchmarks/identity-ci-fix-qualification.json)
retains raw counters, the qualification driver and invalid attempts. Earlier
full-suite trials, including [`identity-contended.json`](../scripts/rust/benchmarks/identity-contended.json),
remain explicitly invalid for performance. These are controlled warm-metadata,
file-remote Linux fixtures, not first-use, network-remote or cross-platform claims.
`scripts/rust/bench-identity.py` prepares and restores fixtures outside command
timing. Rename launches use the same recorded clock phase on both implementations
because published backup filenames have second precision; clocks and snapshot
comparisons remain unchanged.

### Workspace tracking and mutation qualification

Scope/owner batch renaming and patterned remove/delete/recover complete the
workspace tracking and mutation milestone. Batch renaming shares a read-only
inventory and prepares independent plans on the bounded Rust worker pool, while
preserving every input proof, first-error order and serial provider/publication
lifecycle. Native documentation cache reads and conservative empty-documentation
AST proofs avoid redundant parsing; other sources retain the published parser.

The [complete qualification evidence](../scripts/rust/benchmarks/workspace-mutation-batch-regex-qualification.json)
measures source `0f78ee808` against Node 22.22.0 / Bit 2.2.94. Five alternating
pairs per non-TTY, CI and TTY mode passed all 270 full-output, exit-code,
filesystem, cache, object, history, link/mode and file-remote comparisons. Of
these, 260 pairs ran natively; ten intentionally delegated add CI error pairs
are excluded from native speed claims. All 52 eligible native workload/mode
medians were lower. Non-TTY medians in milliseconds were:

| Workload | Node | Rust |
| --- | ---: | ---: |
| Remove 20 tagged components | 559.608 | 290.632 |
| Delete 20 tagged components | 500.531 | 333.604 |
| Recover 20 deleted components | 289.245 | 227.931 |
| Rename a mixed new/exported scope with refactoring | 1046.598 | 999.571 |

Scope gains were modest: 4.2–4.5% in non-TTY/CI, while TTY was effectively tied
(1018.503 ms Node versus 1017.679 ms Rust). Batch package refactoring reuses
lazily compiled matchers, and fully cached capture avoids seeding the same
classes twice; lifecycle callbacks, ordered errors and input proofs remain.
The [mutation samples](../scripts/rust/benchmarks/workspace-mutation-batch-regex.json),
[identity samples](../scripts/rust/benchmarks/workspace-mutation-batch-regex-identity.json),
[add samples](../scripts/rust/benchmarks/workspace-mutation-batch-regex-add.json) and
[status/checkout/export regressions](../scripts/rust/benchmarks/workspace-mutation-batch-regex-regressions.json)
use the same measured source and binary. Each complete workload qualified after
20 consecutive seconds below 30% aggregate host CPU, with a closed 0.5-second
monitor remaining below 80%. Every workload qualified on its first attempt;
no samples or rows were removed or remeasured.

The [earlier qualification](../scripts/rust/benchmarks/workspace-mutation-qualification.json)
retains source `a3393697c` and its preceding slower trials. The separate
[numeric-target qualification](../scripts/rust/benchmarks/workspace-mutation-checkout-fix-qualification.json)
retains source `3d404801a`: all 270 correctness pairs passed, but scope TTY was
slower (1030.642 ms Rust versus 1018.141 ms Node). These reports retain their
original fingerprints and samples. The current archive also includes 78 actual
released-parser checks of checkout/revert positional coercion (`38938e0` becomes
`38938`), supplementing command parity without counting as performance pairs.
Raw workload reports retain their unqualified flags; the outer closed-monitor
evidence qualifies eligible rows. These are controlled warm-metadata Linux
file-remote fixtures, with no first-use, network-remote or cross-platform speed
claim. Fixture preparation and restoration are outside command timing.

Ten direct published-parser oracle checks supplement the empty-documentation
proof tests and are not counted as command pairs. The separate installation
e2e masks completion durations and one exact optional pnpm startup timer redraw
immediately before its hard-link banner; final progress, package summaries,
lifecycle order and filesystem state remain exact. Focused checks retain
changed counters, controls, positions and duplicate redraws.

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

### Provisioning, configuration and diagnostics

`doctor` runs its fixed eight read-only diagnoses concurrently, retains registration order in
results, and gathers runtime metadata after the checks. Named diagnoses retain their individual
execution path. Workspace command history uses the resolved scope, including invocations from
component subdirectories.

Release qualification checked 120 fresh-copy pairs across eight init/config/doctor workloads:
five alternating pairs each in non-TTY, real TTY and CI modes. Every pair compares output,
status, files, directories, modes, global stores, HOME state and native ownership. These Linux
fixtures use Node 22.22.0 / Bit 2.2.94, disabled analytics and `log_level=fatal`.

| Complete command | Node median, non-TTY | Rust release median, non-TTY |
| --- | ---: | ---: |
| `init --standalone` | 208 ms | 1.8 ms |
| `config get benchmark.value` | 340 ms | 3.1 ms |
| `doctor --list` | 228 ms | 1.5 ms |
| `doctor "validate git exec" --json` | 397 ms | 157 ms |
| `doctor --json` | 507 ms | 275 ms |

The full doctor command measured 1.8× lower medians across the three modes; the published
BVM lookup and external npm/yarn metadata remain part of the command. These are local fixture
measurements, without a general or cross-platform speed guarantee. The
[samples, fingerprints and settings](../scripts/rust/benchmarks/consolidation.json) are reproduced
by `scripts/rust/bench-provisioning.py` with explicit pinned Node/CLI and release binary paths.
An additional 45 pairs verified status, checkout and export against the same release artifact;
the [regression measurements](../scripts/rust/benchmarks/consolidation-regressions.json) include
the exact commands, fixture fingerprints and complete-state verifier.

### Component tracking

Native `add` retains one tracking plan through component loading and linking. Rust
owns selectors, ignores, component identities and scopes, main-file selection,
root ownership, package/source links and bitmap/history publication. Directory
variants reuse the installer’s scope resolver. Re-adding a component preserves the
published history write even when the rendered bitmap is unchanged.

Environment resolution, semantic documentation parsing, component-load hooks and
package transforms use the published Harmony providers. Dependency receipts are
validated before caches are published. All package transforms finish before
manifests are written; source links precede bitmap publication. A failure preserves
the published output and filesystem prefix, including earlier cache and manifest
writes. Root components skip dependency auto-detection at the same early boundary
as the published loader while retaining explicit dependency policy.

Unsupported inputs delegate before effects. CI errors whose published diagnostic
includes a JavaScript stack also delegate before providers or publication;
successful CI adds remain native. These delegated error cases are covered for
parity and excluded from native performance claims.

The Linux release qualification in [`add.json`](../scripts/rust/benchmarks/add.json)
compares six complete commands against Node 22.22.0 / Bit 2.2.94 with five
alternating pairs per non-TTY, TTY and CI mode (90 pairs: 80 native and 10 delegated
CI errors). Output, exit status, workspace/repository files, modes, links,
checksum-validated caches, bitmap histories and the actual file remote matched.
Non-TTY medians in milliseconds were:

| Workload | Node | Rust |
| --- | ---: | ---: |
| Add one component | 441.148 | 269.232 |
| Add 100 components / 1,100 files | 1565.424 | 1161.509 |
| Add workspace root | 353.013 | 280.176 |
| Re-add with a new main file | 442.237 | 274.692 |
| Fully ignored input (native error) | 225.821 | 2.049 |
| Blocked package link (native error) | 414.086 | 262.987 |

Every native median was faster across the three modes; delegated CI error rows
are excluded from speed claims. These timing records identify measured commit
`e3ae55f49`. The subsequent outside-workspace diagnostics, filesystem-aware main-file casing
and platform-specific test changes passed another 135 parity pairs; their
[`add-final-contended.json`](../scripts/rust/benchmarks/add-final-contended.json) and
[`add-regressions-final-contended.json`](../scripts/rust/benchmarks/add-regressions-final-contended.json)
records are excluded from timing claims because peak host load exceeded 80%. These are controlled file-remote, warm builtin
metadata fixtures, not first-use, network-remote or cross-platform performance
claims. Records include source, binary, helper and fixture fingerprints and exact
normalizations. A further 45 pairs in
[`add-regressions.json`](../scripts/rust/benchmarks/add-regressions.json) qualify
status, checkout and export using the same release binary. Peak aggregate CPU use
was 16.5%, sampled every 0.5 seconds after a quiet-minute start gate. A representative
contended trial is retained with `performance_valid: false` and excluded from timing
evidence. Reproduce with `scripts/rust/bench-add.py`; fixture preparation and remote
restoration happen outside each measured command.

### Stash publication and restoration

Stash first populates missing existing version histories while checking component status,
including when no components need stashing. It saves detached Versions and file Sources,
then the stash manifest, before resetting
modified components and removing included new components. Component models, heads and bitmap
versions do not advance. Metadata uses the published four-space JSON and lexical stash filename
selection, including its double-digit numbering behavior. Graph references retain the
published pre-allocation component IDs and omitted graph Source behavior.

Load restores new components at their saved roots before merging tracked components. The
three-way base is the detached Version's first parent, including after the current component
has advanced. Tracked bitmap versions remain unchanged. Registered add/compile callbacks run
after native materialization. The stash is consumed only after checkout succeeds; intermediate
failures retain the published persistence prefix.

The Linux release qualification in
[`scripts/rust/benchmarks/stash.json`](../scripts/rust/benchmarks/stash.json)
compares six complete workloads against Node 22.22.0 / Bit 2.2.94, with five
alternating pairs in each of non-TTY, TTY and CI modes (90 pairs). All compared
output, workspace, repository, package and retained global state matched. On these
controlled warm-metadata fixtures, non-TTY medians in milliseconds were:

| Workload | Node | Rust |
| --- | ---: | ---: |
| Save modified | 422.519 | 22.623 |
| Save including new | 443.106 | 23.830 |
| List | 216.531 | 1.544 |
| Load tracked | 422.973 | 7.670 |
| Load with manual conflict | 427.957 | 8.541 |
| Restore new components | 517.330 | 477.524 |

New-component restoration still invokes the published add/compile callbacks; its
measured gain was only 1.01–1.08× across modes, which is near parity. These results do not establish
first-use, cross-platform or large-workspace performance. The record includes
source, binary, helper and fixture fingerprints, exact normalizations and
validated builtin-metadata prewarming shared by both implementations. A further
45 pairs in [`stash-regressions.json`](../scripts/rust/benchmarks/stash-regressions.json)
qualify status, checkout and export using the same release binary. Host load was sampled
every 0.5 seconds; peak aggregate CPU use was 17.3%. A separate contended trial
is retained with `performance_valid: false` and is excluded from speedup evidence.
Linux CI also repeats three lane-import regressions with a 1 MiB main-stack limit.

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
