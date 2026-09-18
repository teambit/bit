---
name: pnpm-engine
description: Work on the pnpm Rust engine (`@pnpm/napi`, the pacquet crates) that `bit install` runs through. Use when a `bit install` problem sits inside dependency resolution, lockfile handling, linking, the virtual store, or the repeat-install fast path, and the fix or the diagnosis needs a locally built engine wired into Bit.
---

# Working on the pnpm engine behind `bit install`

Bit does not shell out to the pnpm CLI. `scopes/dependencies/pnpm/lynx.ts` calls
`nodeApi.install` from `@pnpm/napi`, a Node addon around pnpm's Rust engine
(pnpm v12, "pacquet"). Most install behavior therefore lives in the pnpm
monorepo, not in this repo.

## Where the code is

In this repo:

- `scopes/dependencies/pnpm/lynx.ts` builds the `InstallOptions`, passes every
  project manifest in memory, and maps the result (`stats.added + removed +
  linkedToRoot > 0`) to `dependenciesChanged`. It also keeps Bit's `bit:` block
  in `pnpm-lock.yaml` (`readBitLockfileAttrs` / `addBitAttributesToLockfile`).
- `scopes/dependencies/pnpm/pnpm-prune-modules.ts` removes virtual-store
  directories the current lockfile no longer lists, after every install.
- `scopes/workspace/install/install.main.runtime.ts` is the `bit install`
  command: manifest calculation, the install loop, linking, compile.
- `workspace.jsonc` pins the `@pnpm/napi` version Bit ships.

In the pnpm monorepo (`pnpm/` is the Rust product; read `pnpm/CLAUDE.md` first):

- `pnpm/crates/napi/src/install.rs` — the binding: option overlay, engine
  mode, and the lockfile policy the in-memory manifests get.
- `pnpm/crates/package-manager/src/install/run/` — `Install::run`: the
  workspace-state fast path, the lockfile-vs-manifests dispatch, materialization.
- `pnpm/crates/package-manager/src/optimistic_repeat_install.rs` — the
  "Already up to date" check against `node_modules/.pnpm-workspace-state-v1.json`.
  Node-API callers use `ManifestFreshness::Content`: their manifests are in
  memory (a component directory has no `package.json`), so each importer is
  compared with the lockfile by content, never by mtime.
- `pnpm/crates/package-manager/src/install/prepare_modules_state/up_to_date.rs`
  — the second short-circuit, after the lockfile is verified against the
  manifests: skip materialization when the tree is intact. It never fires when
  the lockfile holds `file:` directory packages, which Bit's injected components
  always are.
- `pnpm/crates/deps-restorer/src/` — the frozen (headless) install: warm-slot
  skipping (`create_virtual_store/snapshot_plan.rs`), directory fetches. A
  `file:` directory snapshot is re-copied (hardlinked) on every materialization,
  matching pnpm's TypeScript engine, so a repeat install that reaches this stage
  reports `added N` for the injected components.

## Build the addon locally

```bash
cd <pnpm-checkout>
cargo build -p pnpm-napi --profile napi-release
```

`napi-release` is the release profile with `panic = "unwind"` (the addon must
not abort the host `node`). Release builds use fat LTO, so linking takes
minutes; use it for timing measurements, and `--profile dev` for quick
iterations when runtime speed does not matter. A cold build of the workspace is
long. If another worktree of the pnpm repo already has a `target/` directory,
point `CARGO_TARGET_DIR` at it to reuse the compiled dependencies.

## Run Bit against the local build

The `@pnpm/napi` loader honors `PNPM_NAPI_BINARY`; the path must end in
`.node`:

```bash
cp target/napi-release/libpnpm_napi.so /tmp/pnpm-napi.node   # .dylib on macOS
PNPM_NAPI_BINARY=/tmp/pnpm-napi.node bit install --log
```

This works with a bvm-installed `bit` as well as `bit-dev`. Check the addon
loads before a long run:

```bash
PNPM_NAPI_BINARY=/tmp/pnpm-napi.node node -e "require('@pnpm/napi')"
```

## Read what the engine did

`bit install --log` interleaves Bit's log with the engine's reporter output.
The lines that matter:

- `Already up to date` — the workspace-state fast path returned before any
  install setup; nothing was read from the store or the registry.
- `Lockfile is up to date, resolution step is skipped` — the lockfile satisfies
  every manifest; the frozen path ran.
- `Progress: resolved N, reused N, downloaded N, added N` — `added` counts
  packages materialized into the virtual store. On a repeat install anything
  above 0 is packages re-copied (usually `file:` directory snapshots).
- `✔ done running package installation using pnpm (completed in Ns)` — Bit's
  timer around the engine call, including the two `readLockfile` calls Bit
  makes around it.

Engine tracing is enabled with the `TRACE` environment variable, which takes
`tracing` EnvFilter directives and prints to stderr:

```bash
TRACE='pacquet::install=debug' PNPM_NAPI_BINARY=... bit install --log
```

A skipped fast path logs its reason at debug level (`repeat-install fast path
skipped`). A bare level such as `TRACE=debug` only targets `pnpm_tarball`, so
always name a target.

## Inspect the lockfiles from Node

`@pnpm/napi` parses lockfiles without going through the engine:

```js
const napi = require('@pnpm/napi') // from the bit installation's node_modules
const wanted = await napi.readLockfile({ dir, kind: 'wanted' }) // pnpm-lock.yaml
const current = await napi.readLockfile({ dir, kind: 'current' }) // node_modules/.pnpm/lock.yaml
```

The current lockfile records what was materialized: only snapshots the
importers reach, and none of the top-level keys pnpm does not define (so no
`bit:` block). `depPathToDirName` from `@teambit/dependencies.pnpm.dep-path`
maps a snapshot key to its `node_modules/.pnpm` directory. `.modules.yaml`
holds the layout settings the previous install used, and
`.pnpm-workspace-state-v1.json` the settings and project list the fast path
compares against.

## Validate a change

In the pnpm checkout:

```bash
cargo nextest run -p pnpm-package-manager -E 'test(optimistic_repeat_install)'
cargo nextest run -p pnpm-napi        # starts the shared mock registry itself
node pnpm/scripts/rustfmt.mjs --all   # the pinned rustfmt, not plain cargo fmt
cargo clippy --locked -p pnpm-package-manager -p pnpm-napi -p pnpm-cli --all-targets -- --deny warnings
```

Prove a new test catches the regression by temporarily reverting the fix and
watching it fail, then restore the fix (edit it back; do not `git restore` a
file that holds other changes). A user-visible change needs a changeset in
`.changeset/` naming `"pacquet"` and `"@pnpm/napi"`; write it for pnpm users
and keep implementation reasoning in the commit message. Never name a
customer or internal workspace in comments, changesets, tests, or commits.

Then rerun `bit install` in a real workspace with `PNPM_NAPI_BINARY` and
compare the reporter lines and timings against the shipped engine.

## Ship it into Bit

Once the pnpm change is released in `@pnpm/napi`, bump its version in
`workspace.jsonc` and run `bit install`. Bit-side changes that depend on new
engine behavior belong in the same PR as the bump.
