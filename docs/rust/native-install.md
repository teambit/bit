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
| `appTypes` | Aspects register application types (file patterns) |
| `packageJsonProps` | Envs and aspects transform the generated `node_modules/<pkg>/package.json` |
| `afterInstall` | Compilation (env compilers) and workspace config files (env config writers) |

Everything else is Rust:

- argv parsing
- reading `workspace.jsonc`, `.bitmap`, `component.json`, variants, the merge-config file, `scope.json` and the root `package.json`
- importing missing objects
- dependency detection and policies
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

| `WorkspaceInstallOptions` | Native |
| --- | --- |
| `lifecycleType`, `savePrefix`, `updateAll`, `addMissingDeps`, `skipUnavailable`, `recurringInstall`, `lockfileOnly`, `restoreFromDependenciesGraph`, `allowScripts`, `skipPrune` | same option |
| `dedupe` | `skipDedupe: !dedupe` (unset means no dedupe, as in TypeScript) |
| `import` | `skipImport: !import` (unset means no import) |
| `compile`, `writeConfigFiles`, `includeOptionalDeps` | skipped only when `false` |
| `updateExisting`, `skipIfExisting` | `existingEntries`: `skip`, else `update`, else `fail` (`EntryAlreadyExist`) |
| `optimizeReportForNonTerminal` | `appendOnly` reporter |
| `showExternalPackageManagerPrompt` | `externalPrompt`; without it, external package manager mode keeps the TypeScript path (it writes `package.json` instead of installing) |
| `dependenciesGraph` (explicit graph) | TypeScript path |
| `copyPeerToRuntimeOnRoot: false`, `copyPeerToRuntimeOnComponents: true` | TypeScript path |
| `addMissingPeers` without `lifecycleType: 'peer'` | TypeScript path (TypeScript adds them as runtime dependencies) |

Workspaces using yarn, `BIT_NATIVE_INSTALL=off` and a missing addon also keep the
TypeScript implementation; `BIT_NATIVE_INSTALL_REQUIRE=on` turns the last two into
errors.

Output follows Bit's logger. The native installer prints status and success
lines while Bit's loader exists, and console lines without a loader only when
`logger.shouldWriteToConsole` is on. Like `PnpmPackageManager.install`, it turns
the loader on after the package manager, and status lines are not shown on CI
(`logger.setStatusLine`).

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
scope name and the configured `user.token`. `require` resolves a relative
path from the current directory, where Bit resolves it from its own module.

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

## Known differences

- Custom env dependency detectors (`getDepDetectors`) are not applied; detection uses the built-in JavaScript/TypeScript, style and MDX extraction.
- Dependency policies an env registers in its own provider are not collected: the host is asked for registered policies only when a component configures a non-env, non-core extension.
- `resolveFromEnv` links of an external env use the env's default package name; a custom `teambit.pkg/pkg` name is not applied there.
- A relative `resolverPath` resolves from the current directory, not from Bit's module directory.
- On Windows, a destination that is a hard link of its source is not recognized as already linked.
- Workspaces configured with the yarn package manager use the TypeScript command, because yarn is a JavaScript package manager.

## CI

The PR e2e jobs never provision the addon, so they run the TypeScript command. The
`Native install e2e` job of `rust-dependency-scanner.yml` builds the addon, points
`BIT_NATIVE_INSTALL_ADDON` at it, and runs the install e2e suites with
`BIT_NATIVE_INSTALL_REQUIRE=on`. With that variable, a missing or unusable addon is an
error instead of a fallback, so the job cannot pass on the TypeScript command by accident.
Workspaces the native command declines on purpose (yarn) still fall back.
