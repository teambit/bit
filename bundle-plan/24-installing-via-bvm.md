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

`scripts/pack-bundle-for-bvm.js` takes the capsule that `bit build` writes for
`teambit.harmony/bit` and produces the tar:

```bash
bd build teambit.harmony/bit --tasks BundleUI,PreBundlePreview,BundleCliApp
node scripts/pack-bundle-for-bvm.js --capsule <capsule-dir> --version 2.2.18-bundle.1
```

Since §9e the bundler emits the published package shape **in place**, so the capsule already is
`@teambit/bit` as it would be published. The script therefore does not rearrange anything:

1. installs the capsule's declared dependencies — the externals, and only the externals — with
   `pnpm --node-linker=hoisted`, pinned to the target platform via `supportedArchitectures` so a
   mac can pack a linux tar (the native addons are per-platform optional deps);
2. `npm pack`s the capsule and unpacks it into `node_modules/@teambit/bit`;
3. rewrites that package.json's `version` to the version being handed out;
4. tars it.

The externals are installed **before** `@teambit/bit` is dropped in, because pnpm reconciles
`node_modules` against the manifest and would prune it otherwise. For the same reason the staging
`package.json` and lockfile are left out of the tar — the same exclusions CI's `compress_bit` uses.

The script refuses to build a tar that would install but not run. It checks the capsule for
`bin/bit`, `dist/core-aspects/bundle/bit.app.js` and the UI/preview pre-bundle
(`@teambit/{ui,preview}/artifacts/ui-bundle/…`, §17), and re-checks them after packing. The
pre-bundle is the one that is easy to lose: without it `bit start` falls back to rebuilding with
rspack, which the default build deliberately cannot do. It only exists if `BundleUI` and
`PreBundlePreview` ran before `BundleCliApp` — hence the task list above.

Verified that `npm pack` keeps `dist/core-aspects/node_modules/@teambit/*` (the shims) while
stripping the capsule's own root `node_modules`, and that the `.hash` gate files inside `artifacts/`
survive both the pack and the tar.

## From CI, with a button

`bundle_deploy` in `.circleci/config.yml` does all of the above on a `bit-bundle*` branch. Trigger
it from the CircleCI web app (Trigger Pipeline) with:

```
run_bundle_deploy = true
bundle_version    = 2.2.18-bundle.1
```

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
cross-platform install is pnpm's (`--os`/`--cpu` there, `supportedArchitectures` here), not the
runner's. They are split only because each installs bit's full ~5000-package tree, where this
installs the ~11 externals. The packer's `@pnpm/napi` check is the same guard
`verify_pnpm_napi_bundle` provides, and it hard-fails rather than shipping a tar that installs and
then cannot run.

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
