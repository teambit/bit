# Handover — bundling the Bit CLI with esbuild

Point a fresh session at this file. It is the entry point; `bundle-plan.md` is the full report and
should be read next.

- **Branch:** `bit-bundle3` (based on `remove-core-envs-from-manifest`, not on `master`)
- **Draft PR:** https://github.com/teambit/bit/pull/10590 — its diff includes the base branch's changes
- **Full report:** `bundle-plan.md` (architecture, measurements, externals breakdown, CI results,
  open questions). Read §9b for the package layout and §9d for the CI run.
- **Layout rationale:** `scopes/harmony/modules/cli-bundler/config.ts` — the file header documents the
  chosen layout and every rejected alternative. Read it before changing any path.

---

## 1. Where it stands

The bundle works. `1.2 GB / 141k files → 231 MB / ~7.3k files`, and `bit --help` went from 0.70 s to
0.64 s.

Verified from an isolated dir (`/tmp/bit-bundle`, workspaces in `/tmp/bundle-tests/*`), with zero
reads from this repo or `~/.bvm`: 40 commands including `init`, `create`, `status`, `list`, `show`,
`compile`, `snap`, `tag`, `export`, `import`, `watch`, `server`, and `build --unmodified` (all 9
tasks, rspack included). A Node single executable also builds and runs.

Two components were added:

| component                              | path                                  | role                                                                                                                |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `teambit.harmony/modules/cli-bundler`  | `scopes/harmony/modules/cli-bundler`  | all the bundling logic. Takes `coreAspectIds` + `packagesRoot` as inputs so it has no dependency on `@teambit/bit`. |
| `teambit.harmony/envs/bit-cli-app-env` | `scopes/harmony/envs/bit-cli-app-env` | env for `@teambit/bit`. Extends `CoreAspectEnv`, appends `BundleCliAppTask`.                                        |

`npm run bundle` is a thin arg parser over the same `bundleCli()` the build task calls — the local
artefact and the published one cannot drift.

---

## 2. Next steps, in order

### 2.1 Wire the env to `@teambit/bit` and run its build — **the immediate task**

```bash
bd env set teambit.harmony/bit teambit.harmony/envs/bit-cli-app-env
bd install                      # env set only takes effect after an install
bd build teambit.harmony/bit
```

Then iterate cheaply, as intended:

```bash
bd build teambit.harmony/bit --reuse-capsules --tasks BundleCliApp
```

**`BundleCliAppTask` has never been executed.** Expect the first run to surface problems; the
likely ones, in order:

1. `readCoreAspectIds()` requires `<capsule>/dist/manifests.js`. If the compiler task writes
   elsewhere, or has not run for `@teambit/bit` by the time a `location: 'end'` task executes, this
   throws. That is the first thing to check.
2. The bundler reads every core aspect's compiled `dist` from `<capsule>/node_modules/@teambit/*`.
   Whether the capsule contains all ~107 of them, compiled, at task time is unverified.
3. `outDir` is the capsule root, which produces the publishable shape directly (§2.2). Confirm the
   capsule's own `dist/` is not clobbered — the task writes `dist/<aspect>/` locators alongside the
   compiler's output.

### 2.2 The published layout (already implemented, not yet exercised by a real build)

```
<package root>/                     ← @teambit/bit
├── package.json                    ← externals as ordinary dependencies + bin
├── bin/bit
└── dist/
    ├── <aspect-name>/index.js      ← locator, one per core aspect
    └── core-aspects/
        ├── bundle/bit.app.js
        └── node_modules/@teambit/<aspect-name>/   ← the shim packages
```

Why this shape (short version — the long one is in `config.ts`):

- Node's upward `node_modules` walk from `dist/core-aspects/bundle/bit.app.js` reaches the shims, so
  `require.resolve('@teambit/<name>')` works with **no runtime change**. `getAspectDir` is on the hot
  path of every command in every user workspace; not touching it was worth an unusual directory.
- npm strips only the **root** `node_modules` from a tarball; a nested one publishes (verified with
  `npm pack --dry-run`).
- `dist/<name>/index.js` is a **locator**, not a package — `DependencyLinker.linkCoreAspect` requires
  it, reads `module.path`, and symlinks `resolve(module.path,'..','..')`. It must not contain a
  `package.json` or node resolves the directory through `main` instead. Verified end to end: a real
  `bit install` produced
  `node_modules/@teambit/workspace -> …/dist/core-aspects/node_modules/@teambit/workspace`.
- This is what lets a bundled build **drop `@teambit/aspect`'s `CoreExporterTask`**, which writes the
  same locators pointing at published packages. Removing/superseding it for `@teambit/bit` is still
  to be done.

### 2.3 Then: the 18 bundle-only e2e failures

From the first full CI run, compared against the baseline `e2e_test` job in the same pipeline
(2876 tests / 23 failures baseline vs 2837 / 41 bundled; every baseline failure also fails in the
bundle, none are unique to the baseline — so the delta is exactly 18):

| #   | cause                                                                                | already documented?                                                                       |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 9   | `failed to start the UI server` — `http.e2e.ts`, `ci-commands`, `lane-export-*-http` | yes — §10.1. Note the UI server backs the **HTTP remote protocol**, not just `bit start`. |
| 2   | missing `@teambit/mdx.modules.mdx-v3-options` in `bit build` with a preview env      | yes — §8.3                                                                                |
| 2   | missing `./get-uid-gid.js` on `bit export` to a shared remote                        | yes — §10.2                                                                               |
| 1   | missing `process/browser` on `bit tag --build`                                       | yes — §10.2                                                                               |
| 2   | missing `@yarnpkg/plugin-npm` on yarn `bit install`                                  | no                                                                                        |
| 1   | `node-gyp rebuild` exit 127                                                          | no                                                                                        |
| 1   | **`zlib.inflate … incorrect header check`** on a scope object                        | no — **investigate first**                                                                |
| 1   | `bit --help` 1849 ms vs a 1500 ms budget                                             | no                                                                                        |

Recommended order: the **zlib** one first (a data-integrity failure outranks missing modules, and it
has no known cause); then the UI server — but _not_ by growing the externals list, which was measured
at **+1.1 GB** and would erase the entire saving (§8.3, `--ui-bundling` flag exists to keep that
measurable); then the cheap externals (`@yarnpkg/plugin-npm`, `process/browser`, `uid-number`,
`node-gyp`); then the startup budget, likely just a non-writable compile-cache dir on CI.

---

## 3. Not in scope for the next session

**The 23 e2e failures that fail on the base branch too** are being handled separately on
`remove-core-envs-from-manifest`. They are listed here only so a bundled-run failure list can be read
correctly — do not fix them on this branch, and do not treat them as bundle regressions.

---

## 4. Commands

```bash
# build the bundle locally (default out dir /tmp/bit-bundle)
npm run bundle                       # flags: --out-dir, --sea, --ui-bundling, --minify, --no-clean
npm run bundle:sea
npm run bundle:ensure                # build only if stale, then install externals
cd /tmp/bit-bundle && npm install    # the externals; only needed when externals.ts changed
node /tmp/bit-bundle/bin/bit --help

# e2e against the artefact
npm run e2e-test:bundle                                   # whole suite
npm run e2e-test:sea
npm run e2e-test:bundle -- ./e2e/commands/cat.e2e.ts      # one spec; extra args go to mocha
npm run e2e-test:bundle -- --force | --no-build
npm run lint                                              # tsc --noEmit + oxlint, the canonical check
```

`ensure-bundle` stamps the out dir (bit version, node/platform/arch, newest `dist` mtime across all
workspace components, bundler mtimes, externals list) and **builds iff the stamp differs** — one CI
build per split machine, and an automatic local rebuild after any `bit compile`.

---

## 5. CI

Two jobs in `.circleci/config.yml`, gated to `^bit-bundle.*` branches:

- `setup_esbuild_bundle` — builds once (~210 s) and persists to the workspace, so all e2e nodes share
  one build. It needs neither bvm nor a compile step: `bit install` compiles by default (which is why
  `setup_harmony` has `bbit compile` commented out), and building the bundle is plain node + npm.
- `e2e_test_esbuild_bundle` — parallelism 40, symlinks the launcher onto PATH as `bit-bundled` and
  reuses the existing `e2e_test_cmd` (same file splitting, timings, junit).

**CircleCI only builds branches with an open PR** (plus scheduled master runs). Pushing alone does
nothing — that is why PR #10590 exists.

Useful without a token (public project):

```bash
curl -s "https://circleci.com/api/v2/project/gh/teambit/bit/pipeline?branch=bit-bundle3"
curl -s "https://circleci.com/api/v2/workflow/<workflow-id>/job"
curl -s "https://circleci.com/api/v2/project/gh/teambit/bit/<job-number>/tests"   # per-test results
```

---

## 6. Repo gotchas worth knowing up front

- **`bd` is this repo's bit binary** (`~/bin/bd` → `bin/bit.js`). `bit` is the bvm-installed release —
  useful as a baseline for "is this failure pre-existing?".
- **`bit install` compiles.** No separate `bit compile` needed after it.
- **The bundle is built from `dist/`**, so `bd compile` must be current or you silently bundle stale
  code.
- **`cat` is aliased to `bat`** in this shell; use `/bin/cat` in scripts.
- **Do not commit `bundle-instructions.md`** — it is the user's own notes, deliberately untracked.
- **`pnpm-lock.yaml` churn**: commit `812eba20d` regenerates it. Most of the 380k lines are _not_ from
  esbuild — `workspace.jsonc` declares `@teambit/node|aspect|env|mdx|readme` while the committed
  lockfile has no importer entries for them, so any `bit install` on this branch re-resolves those
  five and their trees. That commit is isolated so it can be dropped.
- **Commit style**: conventional commits, no Claude attribution (see `CLAUDE.md`).

---

## 7. The two bugs found along the way

Both are in `bundle-plan.md` §6 in full; they matter beyond bundling.

1. **`hook-require` was polluting `Object.prototype`** (`scopes/harmony/bit/hook-require.ts`, fixed in
   `d14d07c52`). It patched `module.constructor.prototype.require`; under a bundler the free `module`
   is the bundler's synthetic record, so `module.constructor` is `Object`. **Worth landing on master
   independently of bundling.**
2. **A package's `exports` map yields up to three copies of the same module** — `@teambit/cli` from an
   `import` → `dist/esm.mjs`, from a `require` → `dist/index.js`, and `@teambit/cli/cli.main.runtime`
   → the raw TypeScript source. The `teambit-dist-resolver-plugin` normalises all first-party packages
   to their compiled `dist`. The same hazard exists for anyone else bundling bit.
