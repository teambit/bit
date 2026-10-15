# Native `bit install`

`bit install` (alias `bit in`) runs in Rust. The command is parsed, planned and
executed by the `bit-install` crate (`native/install`). Package installation calls
pnpm's Rust engine (pacquet) directly as a library. It does not go through
`@pnpm/napi`, and no component is loaded through Harmony.

JavaScript runs only where a component or aspect implements the behavior in
JavaScript. The engine asks for these **host callbacks** while it runs; the Rust
CLI serves them from its embedded host script, which loads the Node.js CLI's
aspects only when a callback is needed. The callbacks are:

| Callback              | Why it is JavaScript                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `prepareInstall`      | Before the package manager, the env requests see only the envs `InstallMain.install`'s component loads register (see below)          |
| `envPolicy`           | The dependency policy of a core env, or of a legacy env without `env.jsonc`, comes from the env's `getDependencies()`                 |
| `registeredEnvPolicy` | The same, for a component of an aspect env, only when it is already registered as an env (never loaded as an aspect to find out)      |
| `dependencyPolicies`  | Aspects and env aspects register dependency policies in their providers (`registerDependenciesPolicies`)                              |
| `appTypes`            | Aspects register application types (file patterns)                                                                                    |
| `detectDependencies`  | Custom dependency detectors: the env's `getDepDetectors()` (or `detectors()`) and the detectors aspects register (`registerDetector`) |
| `packageJsonProps`    | Envs and aspects transform the generated `node_modules/<pkg>/package.json`                                                            |
| `afterInstall`        | Compilation (env compilers) and workspace config files (env config writers)                                                           |

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
host. `hostInfo`, the host's first answer, carries only process facts:

- bit's installation directories and the bvm directory, for linking core aspects;
- the Node.js executable;
- the global config directory;
- terminal width and color support;
- the core aspect package list.

Workspaces using yarn decline to the Node.js CLI.

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
- **an output snapshot:** the size, modification time and SHA-256 of every file in
  those paths.

The next install skips the step only when the fingerprint matches and every output
is intact. A file whose modification time moved is re-hashed, and it is intact when its
content is the same.

There is one exception. The install engine re-syncs the injected copies of workspace
packages (`node_modules/.pnpm/<pkg>@file+<dir>`) from the component directory, which
drops their dist on every install. Compiling writes the same bytes there again. So a
missing or changed output is copied back from an intact output with the same content
(the package's own dist) before the step is skipped. Any other source, config or
package change, and any output that cannot be restored that way, runs the step.

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

| Module         | Responsibility                                                                                                                                           | TypeScript reference                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `options`      | argv → `InstallOptions`, flag validation                                                                                                                 | `install.cmd.tsx`                                                        |
| `host`         | `Host` trait (callbacks above), `HostInfo`                                                                                                               | —                                                                        |
| `jsonc`        | JSONC parse and comment-preserving edits                                                                                                                 | `comment-json` usage in `workspace-config.ts`                            |
| `config`       | Global bit config, `workspace.jsonc` aspects, `dependency-resolver` settings, `scope.json`                                                               | `dependency-resolver.main.runtime.ts`, `workspace-config.ts`             |
| `workspace`    | `.bitmap`, component ids, dirs, files, merged component config (bitmap > component.json > variants), env id, package name                                | `bit-map.ts`, `component-config`, `variants`, `componentIdToPackageName` |
| `policy`       | Workspace, variant and env policies; `env.jsonc` with `extends`                                                                                          | `policy/*`, `environments.main.runtime.ts`                               |
| `dependencies` | Per-component dependency list: detection (scanner and cache), overrides, versions                                                                        | `dependencies-loader/*`, `apply-overrides.ts`                            |
| `manifests`    | Workspace and component manifests: dedupe, env peers, root components, linked root deps                                                                  | `workspace-manifest-factory.ts`, `deduping/*`, `install.main.runtime.ts` |
| `engine`       | pacquet driver: config overlay, registries, proxy and network, script policy, hooks, reporter, lockfile `bit:` block, restore, prune, version resolution | `lynx.ts`, `pnpm.package-manager.ts`, `pnpm-prune-modules.ts`            |
| `links`        | Core aspect `link:` deps, `node_modules/<component>` linking, injected `package.json` links, bit-roots hard links, global virtual store links            | `dependency-linker.ts`, `node-modules-linker.ts`                         |
| `import`       | Pre-install object import (bitmap or lane objects)                                                                                                       | `importer.main.runtime.ts` (`importCurrentObjects`)                      |
| `command`      | Orchestration, install loop, external package manager mode, `allowScripts` persistence, `bit install <pkgs>`, output                                     | `install.main.runtime.ts`                                                |

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

## Lockfile compatibility

The engine's `readPackage` hooks are implemented natively and report the
`pnpmfileChecksum` that Bit's TypeScript integration intended (`bit-1`).
Lockfiles therefore stay compatible between both implementations.

## Envs before the package manager

`InstallMain.install` computes the manifests from components it loads without
loading the envs among them as aspects (`getComponentsDirectory` passes
`loadSeedersAsAspects: false`), and `calculateEnv` resolves an env that is not
registered to the default env, `teambit.harmony/node`, without a warning in the
install context. An external env whose policy is in code (no `env.jsonc`) is
therefore not applied before the package manager, and its components get the
default env's policy, dev patterns and detectors.

`prepareInstall` reproduces this. The first env or aspect request after it loads
the workspace aspects the CLI loads on start, then every component the way
`getComponentsDirectory` does. Until `afterInstall` (which follows the package
manager, as `reloadNonLoadedEnvs` does), an env request never loads an env: one
these loads did not register is the default env, and `dependencyPolicies` returns
the registry without loading the components' extensions (they load with
`loadExtensions: false`). An install that reaches no such request never loads
Harmony.

## Registered dependency policies

Policies registered through `registerDependenciesPolicies` are the slots layer of
`mergeVariantPolicies`: a component gets the registration whose registrar is, or
contains, one of the extension ids it configures. Registering runs in an aspect's
provider, so the host loads the candidate aspects and returns the registry (after
the package manager; before it, the registry as the install's loads left it). To
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

The same templates were installed with the Node.js CLI (`BIT_NATIVE=off`) and natively:

- plain install and repeat install
- `bit install <pkg>`, `<pkg>@<version>`, `--save-prefix`, `-t peer`
- `--skip-compile`, `--update`, `--lockfile-only`

The comparison covers console output, `pnpm-lock.yaml` (including the `bit:` block and `pnpmfileChecksum`), `workspace.jsonc`, the `node_modules` tree, link targets and the generated component `package.json` files. All of these match. The only differences are throttled progress-line fragments.

These install e2e suites passed on the native engine, run through the earlier
integration that loaded it into the Node.js CLI:

- `install`
- `install-and-compile`
- `install-missing-dependencies`
- `dependencies/allow-scripts`
- `root-components`

## Known differences

- Workspaces configured with the yarn package manager decline to the Node.js CLI, because yarn is a JavaScript package manager.
- Against a released Node.js CLI (bit 2.2.94), the installed files are identical, but some progress lines differ: the pre-install import prints one more line (`import 0 components with their dependencies (if missing)`) and can count its imported objects differently, and pnpm's throttled progress lines vary. These are tracked with the other install gaps in #123.

## CI

The `Rust` workflow (`.github/workflows/rust.yml`) runs the crate's unit tests with
the rest of the native workspace. The e2e suites run the Node.js CLI.
