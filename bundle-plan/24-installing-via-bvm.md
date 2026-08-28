# 24. Handing the branch out through bvm

[← back to bundle-plan index](../bundle-plan.md)

The goal is to let someone run the bundled bit without merging or releasing anything: no npm
publish, no `@teambit/bit` version taken, no effect on anyone who is not asking for it.

bvm can already do this. It has two installation methods, and the `tar` one downloads an archive
from GCS and extracts it — it runs no package manager of its own, so whatever the tar holds *is*
the installation. That makes the tar the entire deliverable.

## The layout bvm expects

Verified against bvm 3.0.4 by installing hand-made tars into an isolated `BVM_DIR`:

```
bit-<version>/                            ← the tar's single root directory, named exactly this
└── node_modules/
    ├── @teambit/bit/
    │   ├── package.json                  ← "bvm": { "node": "22.22.0" }, "bin": { "bit": "./bin/bit" }
    │   ├── bin/bit
    │   └── dist/…                        ← the bundle, shims, locators, artifacts
    └── <externals>/…                     ← installed, hoisted
```

Three hard requirements, each of which bvm reads by an absolute path:

- the tar's root directory is `bit-<version>` and nothing else — `install.ts` extracts to
  `~/.bvm/versions/<version>/` and every later step joins `bit-<version>` onto it;
- `node_modules/@teambit/bit/package.json` exists and carries `bvm.node`, which is how bvm picks
  the Node.js to run bit with (`Config.getWantedNodeVersion` reads that exact path, uncaught);
- `node_modules/@teambit/bit/bin/bit` exists — `bvm link` hardcodes it as the bin source.

Everything else is free. In particular the externals are ordinary hoisted packages one level up
from `@teambit/bit`, which is where node's upward `node_modules` walk from
`dist/core-aspects/bundle/bit.app.js` looks for them anyway — the same resolution §9b relies on for
the published shape, so no special casing is needed.

## Producing it

`scripts/pack-bundle-for-bvm.js` turns a built bundle distribution into the tar:

```bash
bd build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules --tasks "BundleUI,PreBundlePreview"
BIT_BIN=bd npm run bundle:prebundle-cache:save
npm run bundle:prebundle-cache:restore
npm run bundle:ensure -- --out-dir /tmp/bit-bundle
node scripts/pack-bundle-for-bvm.js --capsule /tmp/bit-bundle --version 2.2.11-bundle.1
```

Only the UI/preview pre-bundle needs a real `bit build`; the CLI bundle is the bundler script, the
same invocation `setup_esbuild_bundle` runs. Its `--out-dir` is already the published layout
(`bin/bit`, `dist/core-aspects/bundle`, `dist/core-aspects/node_modules`), identical to what the
in-place capsule build emits, so the packer takes either.

The two differ only in `package.json`: a capsule is `@teambit/bit` and carries `bvm.node`, while the
script generates a stand-in `@teambit/bit-bundle-externals` manifest that holds the externals and
the `bin`. The packer normalises that back - name, version, `bin`, and `bvm.node` read from
`workspace.jsonc`, which is where the real published package.json gets it from too. Pass
`--node-version` to override.

> A `bit build teambit.harmony/bit --tasks BundleCliApp` **cannot** stand in for the script on a
> fresh machine. `BundleCliAppTask` reads the capsule's own compiled `dist` (`readCoreAspectIds`
> requires `<capsule>/dist/manifests.js`) and is appended to `core-aspect-env`'s pipeline precisely
> so the compilers run ahead of it - see the comment on `BitCliAppEnv.build()`. Restricting to that
> one task skips `TypescriptTask`/`BabelTask`, nothing writes that `dist`, and the task dies with
> `MODULE_NOT_FOUND`. §9e's "~5 s with `--tasks BundleCliApp`" holds only when an earlier full build
> already populated the capsule. Dropping `--tasks` and passing `--skip-tests` works, but it is a
> full component compile of the CLI for an artifact the script produces in seconds.

Since §9e the bundler emits the published package shape, so the distribution is already
`@teambit/bit` as it would be published. The packer therefore does not rearrange anything:

1. installs the distribution's declared dependencies — the externals, and only the externals — with
   `pnpm --node-linker=hoisted`, pinned to the target platform via `--os`/`--cpu` so a mac can pack
   a linux tar (the native addons are per-platform optional deps);
2. `npm pack`s the distribution and unpacks it into `node_modules/@teambit/bit`;
3. normalises that package.json — name, the version being handed out, `bin`, `bvm.node`;
4. restamps the `@teambit/bit` **shim**'s version to match (see below);
5. tars it.

### Which package.json `bit --version` actually reads

Not the one bvm reads. `getBitVersion()` resolves `require.resolve('@teambit/bit')` from inside
`bit.app.js`, which lives in `dist/core-aspects/bundle/`, so node's upward `node_modules` walk finds
the **shim** in the sibling `dist/core-aspects/node_modules/@teambit/bit/` first and never reaches
the outer manifest. The shim carries whatever version the build machine had installed
(`generate-shim-packages` preserves the original's), so an un-restamped tar reports the base version
and every `-bundle.N` build looks identical from the CLI. The packer restamps `version` there too;
`componentId` is left alone, since that identifies the component, which really is the base version.

One consequence to know before setting `engine`: a pre-release satisfies no ordinary semver range —
`2.2.11-bundle.1` fails `^2.2.0`, `>=2.0.0`, `2.x` *and* `^2.2.11`, because a range only admits
pre-releases when it names one on the same version tuple. `load-bit.ts`'s `verifyEngine` calls plain
`satisfies(getBitVersion(), bitConfig.engine)`, so a workspace that sets `teambit.harmony/bit`'s
`engine` will warn under a bundle build — and throw, if it also sets `engineStrict`. The field is
opt-in and bit's own `workspace.jsonc` does not set it (the `engineStrict` there belongs to
dependency-resolver and is about Node.js), so this bites only workspaces that pin it deliberately.

The externals are installed **before** `@teambit/bit` is dropped in, because pnpm reconciles
`node_modules` against the manifest and would prune it otherwise. For the same reason the staging
`package.json` and lockfile are left out of the tar — the same exclusions CI's `compress_bit` uses.

The packer refuses to build a tar that would install but not run. It checks the distribution for
`bin/bit`, `dist/core-aspects/bundle/bit.app.js` and the UI/preview pre-bundle, and re-checks them
after packing. The pre-bundle is the one that is easy to lose: without it `bit start` falls back to
rebuilding with rspack, which the default build deliberately cannot do.

What it asserts on is each aspect's `artifacts/ui-bundle/.hash`, not the directory around it —
that file is the gate `bit start` reads to decide a pre-bundle exists at all, so a tree without it
is one bit would ignore anyway. Note the UI has **one** `.hash` covering both roots, mapping each
root aspect id to its hash: the two roots are a single rspack compilation now (one entry each,
`workspace.html`/`scope.html`), so the per-root `ui-bundle/{workspace,scope}/` directories §17's
table describes no longer exist. On failure the packer prints what the artifacts trees actually
hold, so a layout change reads as a layout change rather than as a missing build step.

Verified that `npm pack` keeps `dist/core-aspects/node_modules/@teambit/*` (the shims) while
stripping the capsule's own root `node_modules`, and that the `.hash` gate files inside `artifacts/`
survive both the pack and the tar.

## From CI, with a button

`bundle_deploy` in `.circleci/config.yml` does all of the above on a `bit-bundle*` branch. Trigger
it from the CircleCI web app (Trigger Pipeline) with:

```
run_bundle_deploy = true          (boolean)
bundle_version    = 2.2.11-bundle.1     (string, optional)
```

`bundle_version` is optional. Left out, `scripts/next-bundle-version.js` derives it: the base is
this branch's own `teambit.harmony/bit` version from `.bitmap`, and the counter is the next one
free in bvm's live index. So the version tracks the branch as it merges master, a re-run cannot
overwrite an earlier build, and there is no counter to remember. Pass it explicitly only to
override.

The resolved version is written to `bvm-tars/version.txt` and the publish job reads it from there
rather than from the parameter, so the two jobs cannot disagree about what was built.

It builds the UI/preview pre-bundle, then the CLI bundle into the `@teambit/bit` capsule, packs a
tar per platform, uploads them with their checksums, and adds the `dev` index entry.

It is deliberately a separate workflow rather than a branch filter on `harmony_deploy`, because
every job in that one assumes the version is already on npm — `setup_bit_version` reads
`npm view @teambit/bit version` and `install_bit_bundle` pnpm-adds it — which is exactly what is
not true here. `run_bundle_deploy` is also added to the `unless` guard of `build_and_test` and
`harmony_deploy`, so triggering a deploy does not also launch the full e2e matrix. Verified with
`circleci config process`: with the parameter set only `bundle_deploy` is emitted, and with the
defaults it is absent entirely.

All five tars come from one linux container, unlike `harmony_deploy`'s three jobs. That is not a
shortcut: `bundle_version_macos` and `bundle_version_windows` are `*defaults` too — the
cross-platform install is pnpm's `--os`/`--cpu`, the same flags `install_bit_bundle` passes, not the
runner's. They are split only because each installs bit's full ~5000-package tree, where this
installs the ~11 externals. The packer's `@pnpm/napi` check is the same guard
`verify_pnpm_napi_bundle` provides, and it hard-fails rather than shipping a tar that installs and
then cannot run.

Those two flags have to stay on the command line. Setting `pnpm.supportedArchitectures` in the
staging `package.json` reads as equivalent and silently is not: pnpm 12 no longer takes settings
from that field (`config.yml`'s `install_bit_bundle` carries the same note), so it warns *"The
following keys were ignored"* and installs the **host** platform. On a linux runner that produces a
correct linux-x64 tar and four tars that would install and then fail to run — caught here only
because the `@pnpm/napi` check is a hard failure. Verified on pnpm 10.17.1 and 12.0.0-rc.7; note
`pnpm install --help` documents the flags on `add` only, but `install` honours them on both.

## Versioning and who sees it

A pre-release version — `<the real version>-bundle.1`, `.2`, … — keeps the builds ordered next to
the releases without taking a version anyone else would get.

bvm filters `index.json` by the release type the client asks for, and the entries are independent
booleans, so listing a build under `dev` makes it invisible on the default (`stable`) and on
`nightly`, and reachable only by someone who opts in:

```bash
node scripts/add-bvm-index-entry.js --version 2.2.18-bundle.1 --release-type dev
# upload index.json, then:
BVM_RELEASE_TYPE=dev bvm install 2.2.18-bundle.1 --method tar
```

`BVM_RELEASE_TYPE` is per-invocation; `bvm config set RELEASE_TYPE dev` makes it the default for
that machine and makes `bvm upgrade` track the bundle builds.

Listing it is optional. `bvm install <version> --file <tar> --method tar` installs a tar directly,
and an explicit version is never looked up in the index at all, so the tar can also be handed out
by URL alone.

Pass `--method tar` either way: the default is `package-manager`, which tries to install
`@teambit/bit@<version>` from the registry first, and for an unpublished version that is a failed
network round-trip before the fallback.

### One bvm fix is needed

bvm ≤ 3.0.4 cannot install a pre-release from a tar. `FsTarVersion.version` reads the version back
out of the tar file name with `split('-')[1]`, which returns `2.2.18` for
`bit-2.2.18-bundle.1-darwin-arm64.tar.gz`. The files extract to the right place and the install
then fails on the last step with `version 2.2.18 is not installed`.

Fixed in the bvm repo (`fix: support pre-release versions in tar installs`): the file name is
parsed by stripping the archive extension and the `-<os>-<arch>` suffix, and `installVersion` links
the version it extracted rather than the one it read back from the name. **That fix has to be
released before any `-bundle.N` tar is usable.** Plain (non-pre-release) versions work on 3.0.4 as
is.

## Per platform

The externals include native addons, so there is one tar per platform, exactly as the release
pipeline already produces: `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, `win-x64`. The
uploaded object name is what bvm derives from the index entry, so it has to be
`bit/versions/<version>/bit-<version>-<os>-<arch>.tar.gz` in `gs://bvm.bit.dev`. The script prints
the `gsutil` commands.
