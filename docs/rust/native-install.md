# Native `bit install`

`bit install` (alias `bit in`) runs in Rust. The command is parsed, planned and
executed by the `bit-install` crate (`native/install`). Package installation calls
pnpm's Rust engine (pacquet) directly as a library. It does not go through
`@pnpm/napi`, and no component is loaded through Harmony.

JavaScript runs only where a component or aspect implements the behavior in
JavaScript. These **host callbacks** follow the model `@pnpm/napi` uses for a
JavaScript `readPackage` hook: the engine runs on its own thread and calls a
JavaScript function through a thread-safe function. The callbacks are:

| Callback | Why it is JavaScript |
| --- | --- |
| `envPolicy` | The dependency policy of a core env, or of a legacy env without `env.jsonc`, comes from the env's `getDependencies()` |
| `dependencyPolicies` | Aspects and env aspects register dependency policies in their providers (`registerDependenciesPolicies`) |
| `appTypes` | Aspects register application types (file patterns) |
| `detectDependencies` | Custom dependency detectors: the env's `getDepDetectors()` (or `detectors()`) and the detectors aspects register (`registerDetector`) |
| `packageJsonProps` | Envs and aspects transform the generated `node_modules/<pkg>/package.json` |
| `afterInstall` | Compilation (env compilers) and workspace config files (env config writers) |

Everything else is Rust:

- argv parsing
- reading `workspace.jsonc`, `.bitmap`, `component.json`, variants, the merge-config file, `scope.json` and the root `package.json`
- importing missing objects
- dependency detection (except custom detectors) and policies
- manifest generation
- registry and network configuration
- the engine call and its `readPackage` hooks
- the lockfile `bit:` block
- linking and pruning
- comment-preserving edits to `workspace.jsonc`
- console output

## Entry point

The Rust `bit` CLI (`native/cli`, see [the Rust CLI](../rust-cli.md)) runs the
command in process and serves the host callbacks with its embedded JavaScript
host. The in-process route below is the earlier integration and is superseded.


`scopes/harmony/bit/run-bit.ts` routes `bit install`/`bit in` to
`scopes/harmony/bit/rust-install.ts` before Harmony is bootstrapped. That
module:

1. loads `bit-workspace.node`;
2. calls its `install(argv, hostInfo, hostCallback)` export;
3. renders nothing itself: Rust writes all output.

`hostInfo` carries only process facts:

- bit's installation directories and the bvm directory, for linking core aspects;
- `process.execPath`;
- the global config directory;
- terminal width and color support;
- the core aspect package list.

`BIT_NATIVE_INSTALL=off` routes the command to the previous TypeScript
implementation.

## Programmatic installs

Other commands install through `InstallMain.install` (`bit import`, `bit new`,
`bit fork`, `bit rename`, `bit merge`, `bit clone`, `bit lane import`, `bit eject`,
generators creating components, the IDE API). Those calls also run on the native
installer: `scopes/workspace/install/native-install.ts` calls the addon's
`installWithOptions` with the options as JSON, and the running Harmony instance
serves the host callbacks. `afterInstall` runs the TypeScript cycle body on the
loaded aspects (global virtual store bridge, `setOldNonLoadedEnvs`, env reloads,
compile, config files) without loading Harmony again.

In programmatic mode the native installer prints neither the command's runner
line, its "Resolving component dependencies" line nor the summary, and does not
resolve component ids among the packages, as `InstallMain.install` does not. It
returns the old non-loaded envs (`getOldNonLoadedEnvs`). The TypeScript side then
reloads `workspace.jsonc` when the native installer changed it
(`triggerOnWorkspaceConfigChange`), clears the workspace cache and returns the
component directory map. The native installer writes the `onPostInstall` event,
so it is not published again.

The calling command may have changed the workspace config in memory without
writing it (`setExtension`). The TypeScript install reads those changes, and
`persistConfig` writes them along with its own edits because it writes the whole
config. The native installer reads and edits `workspace.jsonc` on disk. So when
the parsed file and the in-memory config differ in content (comments and
formatting aside), `native-install.ts` first writes the in-memory config the way
`persistConfig` does: `WorkspaceConfig.write`, with a history backup whose reason
is `install`. The native installer then sees those changes and edits on top of
them. One difference remains: the TypeScript install writes pending changes only
when it edits the config itself, while the native path writes them before every
call. When the native installer edits nothing, the file already holds what the
calling command would write later.

| `WorkspaceInstallOptions` | Native |
| --- | --- |
| `lifecycleType`, `savePrefix`, `updateAll`, `addMissingDeps`, `skipUnavailable`, `recurringInstall`, `lockfileOnly`, `restoreFromDependenciesGraph`, `allowScripts`, `skipPrune`, `copyPeerToRuntimeOnComponents` | same option |
| `copyPeerToRuntimeOnRoot` | same option; unset means `true` |
| `addMissingPeers` | same option. Missing peers, like added packages and missing deps, use `lifecycleType` or `runtime` (`_addPackages`). `bit install --add-missing-peers` sets the lifecycle to `peer`, as `install.cmd.tsx` does |
| `dedupe` | `skipDedupe: !dedupe` (unset means no dedupe, as in TypeScript) |
| `import` | `skipImport: !import` (unset means no import) |
| `compile`, `writeConfigFiles`, `includeOptionalDeps` | skipped only when `false` |
| `updateExisting`, `skipIfExisting` | `existingEntries`: `skip`, else `update`, else `fail` (`EntryAlreadyExist`) |
| `optimizeReportForNonTerminal` | `appendOnly` reporter |
| `showExternalPackageManagerPrompt` | `externalPrompt`. Without it, external package manager mode writes the dependencies to `package.json` instead of installing (below) |
| `dependenciesGraph` (explicit graph) | `dependenciesGraph`: the serialized graph (`DependenciesGraph.serialize()`). It comes before the graphs `restoreFromDependenciesGraph` reads, and like them it is restored only with root components. A conversion failure fails the install only with `restoreFromDependenciesGraph` (`failOnDependenciesGraphError`) |

External package manager mode without `showExternalPackageManagerPrompt` follows
`writeDependenciesToPackageJson`. The root manifest is calculated as
`_getComponentsManifests(installer, mergedRootPolicy, { dedupe: true,
includeAllEnvPeers: false })` calculates it: the root copies no peers to its
dependencies and gets no env peers. There is no dependency filter and no linked
root dependency. Without `resolveEnvPeersFromRoot`, components get only the env
peers they use or list in their own policy, plus `react-dom` along with `react`.
`{ ...devDependencies, ...dependencies }` of that manifest is set in the root
`package.json`'s `dependencies`, keeping the file's indentation and newlines
(`detect-indent`, `detect-newline`, `stringify-package`). The skip notice follows.
Nothing is imported, installed or compiled, and no `onPostInstall` event is
written. The addon returns `{ outcome: "skipped" }`, and `InstallMain.install`
returns an empty component map without reloading the config or clearing caches.

Workspaces using yarn, `BIT_NATIVE_INSTALL=off` and a missing addon keep the
TypeScript implementation; `BIT_NATIVE_INSTALL_REQUIRE=on` turns the last two into
errors.

Output follows Bit's logger. The native installer prints status and success
lines while Bit's loader exists, and console lines without a loader only when
`logger.shouldWriteToConsole` is on. Like `PnpmPackageManager.install`, it turns
the loader on after the package manager, and status lines are not shown on CI
(`logger.setStatusLine`).

## Custom dependency detectors

Precinct asks custom detectors before its built-in detectives: first the env's
detectors (`getDepDetectors()`), then those aspects register (`registerDetector`).
The first one supporting a file (`isSupported({ ext, filename })`) detects it alone.
`detectDependencies` takes the env id (without version), the component dir and
the component's absolute file paths. It runs `detectWithCustomDetectors` of
`@teambit/dependency-resolver`, which returns
`{ "<file>": { dependencies, typescript, lookups } }` for the files a custom
detector supports, or `null` when the env has no detectors and every registered
detector is one Rust replicates (env.jsonc, MDX). `typescript` marks a file a
registered detector supports: `filing-cabinet` resolves its relative imports
through `lookupTypeScript`. The detected specifiers replace the native scan of the
file. After that they are resolved and classified like any other import: packages,
components, relative files and missing packages. `@bit-no-check` files and detector
errors yield nothing.

`filing-cabinet` resolves a file's imports with a detector's `dependencyLookup`
when one applies: the lookup of the registered detector supporting the file,
replaced by that of the last env detector supporting it. The host calls it as
`filing-cabinet` does, unbound, with `{ dependency, filename, directory, config,
webpackConfig, envDetectors }` (`directory` is the component dir, `isScript` is
added for an object result), for every specifier except built-ins and http ones.
`lookups` maps each to the returned path (`path.resolve`d, as `fs.existsSync`
reads it) or to `null` when the lookup returned nothing; a lookup that throws
yields nothing for the file, as a resolve error does. Rust classifies a returned
path as `dependency-tree` does: an existing path under `node_modules` is the
package containing it (`resolvePackageData`; one without a `package.json` is
ignored), any other existing path a file of the component, of another component,
or untracked. A path that does not exist is missing: a relative specifier is a
missing file, a package is looked up by name (`MissingHandler`). When the lookup
returned nothing and the specifier has a different extension with a default
lookup, that lookup is tried first, as `filing-cabinet` retries.

The host is asked only for a component that can have a custom detector. Its env
must not be a core env, because no core env implements `getDepDetectors()`, or a
non-core aspect must be configured, which could register a detector: on the
component, or at the root of `workspace.jsonc`. The CLI loads the root aspects on
start (`getNotLoadedConfiguredExtensions`), but `loadBit` does not, so the first
`detectDependencies` request carries them as `aspectIds` and the host loads them
before detecting. The aspects the components configure are loaded earlier, by
`dependencyPolicies`. An env the host reports without detectors is not asked about
again. Components of core envs therefore never reach the host in a workspace
without custom aspects. A non-core env loads the env in the host, but the host
already loads it for its dev patterns.

The dependency cache entry is keyed by the component id and checked against file
times, as in TypeScript, and does not record detector output. An entry written by
an install that did not apply the detectors would be stale. A component a custom
detector applies to is therefore always detected, and its entry is written again.

## Repeat installs skip `afterInstall`

`afterInstall` loads Harmony to compile the workspace and write its config files. On
a repeat install that changed nothing, the native installer skips it and prints the
compile step's success line itself.

After a compilation without errors and a complete config write, the hosts return the
paths both wrote: each compiled component's dist directories (`BuildResult.distDirs`,
including injected directories) and the config files. Rust then writes a stamp to
`<scope>/cache/native-install/after-install.json` with:

- **an input fingerprint:** the bit version, `workspace.jsonc`, `.bitmap`,
  `pnpm-lock.yaml`, and the size and modification time of every file under each
  component directory except `node_modules`. The component loader also picks up files
  `.bitmap` does not list, so directories are walked, not the `.bitmap` file lists.
- **an output snapshot:** the size and modification time of every file in those paths.

The next install skips the step only when both still match. Any source, config or
package change, and any removed or edited output, runs it again.

The step always runs:

- for programmatic installs;
- with `--skip-compile` or `--skip-write-config-files`;
- when an env failed to load;
- with the `no-fs-cache` feature;
- when a `link:` or `file:` dependency resolves outside the workspace's components,
  its `node_modules` and the directories bit links its core aspects from, because
  such a package can change without any input changing.

No stamp is written after compile errors, a failed config write, or a config write
that left files bit did not generate, because each of those prints output every time.
An installed bit whose hosts don't report these paths never writes one either. Bit's
own code is identified by its version, so a development build changed without a
version bump needs one full install, or removing the stamp.

## Crate layout (`native/install/src`)

| Module | Responsibility | TypeScript reference |
| --- | --- | --- |
| `options` | argv → `InstallOptions`, flag validation | `install.cmd.tsx` |
| `host` | `Host` trait (callbacks above), `HostInfo` | — |
| `jsonc` | JSONC parse and comment-preserving edits | `comment-json` usage in `workspace-config.ts` |
| `config` | Global bit config, `workspace.jsonc` aspects, `dependency-resolver` settings, `scope.json` | `dependency-resolver.main.runtime.ts`, `workspace-config.ts` |
| `workspace` | `.bitmap`, component ids, dirs, files, merged component config (bitmap > component.json > variants), env id, package name | `bit-map.ts`, `component-config`, `variants`, `componentIdToPackageName` |
| `policy` | Workspace, variant and env policies; `env.jsonc` with `extends` | `policy/*`, `environments.main.runtime.ts` |
| `dependencies` | Per-component dependency list: detection (scanner and cache), overrides, versions | `dependencies-loader/*`, `apply-overrides.ts` |
| `manifests` | Workspace and component manifests: dedupe, env peers, root components, linked root deps | `workspace-manifest-factory.ts`, `deduping/*`, `install.main.runtime.ts` |
| `engine` | pacquet driver: config overlay, registries, proxy and network, script policy, hooks, reporter, lockfile `bit:` block, restore, prune, version resolution | `lynx.ts`, `pnpm.package-manager.ts`, `pnpm-prune-modules.ts` |
| `links` | Core aspect `link:` deps, `node_modules/<component>` linking, injected `package.json` links, bit-roots hard links, global virtual store links | `dependency-linker.ts`, `node-modules-linker.ts` |
| `import` | Pre-install object import (bitmap or lane objects) | `importer.main.runtime.ts` (`importCurrentObjects`) |
| `command` | Orchestration, install loop, external package manager mode, `allowScripts` persistence, `bit install <pkgs>`, output | `install.main.runtime.ts` |

## Engine pin

`native/Cargo.toml` pins pnpm at the commit that released `@pnpm/napi` 12.10.1,
the engine version Bit ships (`workspace.jsonc`). It also repeats pnpm's
`[patch.crates-io]` entries.

pnpm's `deps-restorer` embeds `cas-loader.mjs.inc`, a bundle that pnpm builds
and does not commit. It is only used by pnpm's experimental CAS store loader,
which Bit never enables. Before a build, `node scripts/rust/prepare-pnpm-engine.mjs`
writes a stub that fails loudly into the pinned checkout. The script is
idempotent; every CI job runs it after fetching and before compiling, including
the Alpine release container. It must also run after a restored `~/.cargo/git`
cache.

## Packaging

The engine ships inside `bit-workspace.node`, the addon of the packaged
object-import helper. The artifact's source identity covers `native/install`.

Third-party notices take each crate's own license files where it publishes them.
Otherwise they use pinned texts from
`scripts/rust-dependency-analysis/artifacts/licenses/sources.json`:

- **pnpm engine crates:** the MIT `pnpm-*` crates use the pnpm repository's root
  `LICENSE` at the pinned revision. The packager checks it against the checkout.
- **`pnpr-*` crates:** they reach the engine through `pnpm-pnpr-client` and name
  a `license-file` with PolyForm Shield 1.0.0. That is not an OSI license. The
  file is included verbatim and its hash is checked.
- **A few crates.io crates without license files:** their upstream text, or the
  canonical SPDX text with the crate authors as copyright holders. Each is
  pinned by version and VCS revision.

The engine raises the dependency count to about 560 crates. Each distinct
license text is therefore written once, and later crates reference it by
digest. For `aarch64-apple-darwin` that keeps the notices at about 1.5 MB, well
inside the 4 MiB bound that packaging, installation and runtime discovery
verify. The scanner artifact lists only the scanner's own dependency closure.

## Lockfile compatibility

The engine's `readPackage` hooks are implemented natively and report the
`pnpmfileChecksum` that Bit's TypeScript integration intended (`bit-1`).
Lockfiles therefore stay compatible between both implementations.

## Registered dependency policies

Policies registered through `registerDependenciesPolicies` are the slots layer of
`mergeVariantPolicies`: a component gets the registration whose registrar is, or
contains, one of the extension ids it configures. Registering runs in an aspect's
provider, so the host loads the candidate aspects and returns the registry. To
keep `bit install` from loading Harmony where nothing can register, the
candidates are the configured extension ids that are not core aspects (core
aspects and core envs never register one), and the component's env only when it
is an env aspect:

- An env whose own env is `teambit.envs/env` is an env plugin (`*.bit-env.*`). It
  is loaded without a provider, so it cannot register a policy and is not a
  candidate. This holds whether or not it has an `env.jsonc`.
- Any other non-core env is an aspect whose provider may register one, with or
  without an `env.jsonc`. A workspace env is classified by its own env, an
  external env by the Version the scope holds. An env the scope does not hold
  is a candidate, since only loading it tells.

Most custom envs are env plugins, so their workspaces make no host call before
the package manager. An env aspect without an `env.jsonc` already loads Harmony
for `envPolicy`, so it adds no load either.

## `resolveFromEnv` links

Without root components, a policy entry marked `resolveFromEnv` is linked at the
root from where the component's env resolves it (`linkDepsResolvedFromEnv`). The
env's directory is a core env's directory in the running bit, or its package in
the workspace `node_modules`: a workspace env under its package name, an external
env under the name the scope records for its Version (`getPackageName`, which
applies a `teambit.pkg/pkg` `packageJson.name`). That is the name the env is
installed under; the default name is used only when the scope does not hold the
env. The root-components env package (`_getEnvPackage`) uses the same name.

## Pre-install import

The import requests what `importCurrentObjects` requests, and nothing more:

- No artifacts: `ObjectFetcher` sends `includeArtifacts: false`, and the
  objects-only import never calls `importAllArtifactsFromLane`.
- No `LaneHistory` objects: the lane object comes from
  `getCurrentRemoteLane()`, which fetches with the default
  `includeLaneHistory = false`. The local lane's history is still updated when
  the fetched lane is merged into it, as `saveLane` does.
- No parent traversal (`collectParents`): the import does not pass
  `allHistory`.
- With `BIT_FETCH_INCOMPLETE_VERSION_HISTORY` set, components whose local
  `VersionHistory` is incomplete since the requested version are fetched again,
  and complete histories record the version in `graphCompleteRefs`.

A `resolverPath` in `scope.json` names a JavaScript module that resolves scopes
with no configured remote, instead of the hub. The module runs in the Node.js
that runs Bit, as a one-shot process, and gets the scope name, the workspace
scope name and the configured `user.token`. As in Bit, the path is `require`d from
`remote-resolver.js` of the `@teambit/scope.remotes` that Bit runs, so a relative
path or a package name resolves from there. Without that package it resolves from
the current directory.

## Validation

The same templates were installed with the TypeScript command (`BIT_NATIVE_INSTALL=off`) and natively:

- plain install and repeat install
- `bit install <pkg>`, `<pkg>@<version>`, `--save-prefix`, `-t peer`
- `--skip-compile`, `--update`, `--lockfile-only`

The comparison covers console output, `pnpm-lock.yaml` (including the `bit:` block and `pnpmfileChecksum`), `workspace.jsonc`, the `node_modules` tree, link targets and the generated component `package.json` files. All of these match. The only differences are throttled progress-line fragments.

These install e2e suites pass on the native path:

- `install`
- `install-and-compile`
- `install-missing-dependencies`
- `dependencies/allow-scripts`
- `root-components`

`commands/import` runs installs through `InstallMain.install`, so it covers the
programmatic entry.

## Known differences

- Workspaces configured with the yarn package manager use the TypeScript command, because yarn is a JavaScript package manager.

## CI

The PR e2e jobs never provision the addon, so they run the TypeScript command. The
`Native install e2e` job of `rust-dependency-scanner.yml` builds the addon, points
`BIT_NATIVE_INSTALL_ADDON` at it, and runs the install e2e suites and `commands/import`
(programmatic installs) with
`BIT_NATIVE_INSTALL_REQUIRE=on`. With that variable, a missing or unusable addon is an
error instead of a fallback, so the job cannot pass on the TypeScript command by accident.
Workspaces the native command declines on purpose (yarn) still fall back.

`native-install-full-e2e.yml` runs the whole e2e suite the same way, in 20 shards split
like CircleCI's (`scripts/split-e2e-tests.js`). It is too heavy for every PR, so it runs
on PRs labeled `native-install-full-e2e`, or by hand.
