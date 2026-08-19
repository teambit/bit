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

### 2.1 Wire the env to `@teambit/bit` and run its build — **DONE; the task now passes**

```bash
bd env set teambit.harmony/bit teambit.harmony/envs/bit-cli-app-env
bd install                      # env set only takes effect after an install
bd build teambit.harmony/bit
```

Then iterate cheaply, as intended:

```bash
bd build teambit.harmony/bit --reuse-capsules --tasks BundleCliApp
```

**`BundleCliAppTask` has now been executed.** Results against the three predicted failure modes:

1. ✅ **Not a problem.** `readCoreAspectIds()` found `<capsule>/dist/manifests.js` and returned the
   ids. The `location: 'end'` ordering is fine.
2. ✅ **Was a problem, now fixed** — see §2.1a. The aspects were present all along; the bundler
   path-joined where it should have resolved. The task now reports **106 core aspects (9 genuinely
   UI-only)**, copies 105 assets, and produces a 69 MB bundle with 107 shims and 107 locators,
   exit 0. The freshness of the resolved copies was also checked and is correct (§2.1a).
3. ✅ **Resolved.** `outDir` is now the capsule root, so the build emits the §2.2 publishable shape
   directly. `inPlace` stops `cleanOutDir` running — it deletes everything but `node_modules`, which
   at the capsule root would have deleted the component's own sources and dist — and merges into the
   real `package.json`, pruning **168 declared dependencies down to the 7 externals**.

### 2.1a What the first runs showed — the bundler was looking in the wrong place (fixed)

`getCoreAspectsInfo` reported `core aspects: 71 (70 without a main runtime)` and skipped 35 with
`is not installed under <capsule>`. **The aspects are not missing.** Capsules share a hoisted root:

| location                                | `@teambit/*` entries | what they are                                    |
| --------------------------------------- | -------------------- | ------------------------------------------------ |
| `<capsule>/node_modules/@teambit/`      | 74                   | 71 pnpm-store symlinks + 3 sibling-capsule links |
| `<capsule-root>/node_modules/@teambit/` | **299**              | everything else, incl. all 35 "missing" ones     |

`<capsule>/package.json` declares 128 `@teambit` dependencies including `@teambit/cli` and
`@teambit/envs`; they simply hoist one level up, where node's upward walk finds them. The bundler
does a literal `join(packagesRoot, 'node_modules', packageName)` **path check instead of node
resolution**, so it never looks there.

Five defects, all the same root assumption, all fixed in `resolve-package-dir.ts` and its callers:

1. **`getCoreAspectsInfo` path-joined instead of resolving.** `resolvePackageDir` now walks the
   `node_modules` chain the way node does. 71 → 106.
2. **It returned the symlink, not the realpath.** Under pnpm a `node_modules` entry links into a store
   slot and the package's own dependencies live in _that_ slot. Normalising to the link walks the
   consumer's tree instead and misses them — a wall of `Could not resolve` for transitive deps that
   were installed all along. `realpathSync` fixed it.
3. **`findRuntimeAndAspectFiles` read only the top level**, true of this repo's symlink-farm-of-sources
   and false for published packages and capsules, which keep the compiled runtime files in `dist/`
   (`@teambit/cli` has no top-level match but has `dist/cli.main.runtime.js`). Hence "70 of 71 without
   a main runtime" — near-total and **silent**, since a missing main runtime is legitimate for a
   UI-only aspect. It now checks `dist` **first**: a bare `@teambit/x` resolves to `dist/index.js`, so
   a deep import to the top-level `.ts` would put the same aspect in the bundle twice (§6.2).
4. **Specifiers must keep the extension under `dist/` and drop it at the top level.** The two take
   different branches of the exports map and neither extension-probes — verified:
   `@teambit/cli/dist/cli.main.runtime` does not resolve, `…/cli.main.runtime.js` does, and
   `@teambit/envs/environments.main.runtime` resolves to the raw `.ts`.
5. **`teambit-dist-resolver-plugin` keyed off `_bit_local`**, which a capsule's copies do not carry —
   so normalisation silently stopped applying and esbuild fell through to the ESM bridge, producing
   the one error of the first run:

   ```
   bit.main.runtime.ts:2:9: ERROR: No matching export in
     ".../capsules/root/c0abd8062/teambit.envs_envs@1.0.1097/dist/esm.mjs" for import "getLegacyCoreEnvsIds"
   ```

   It now keys off `componentId` (present in all 298 capsule-root components) and falls back to
   esbuild for non-workspace components instead of failing the build.

The same assumption also broke `copy-assets` (0 of 4 asset patterns matched → now 105 files),
`create-package-json`'s version lookup (3 of 11 externals → 7) and `build-workers`' entry points.

**The freshness question — asked, then answered: the premise is sound.** It looked alarming at first,
because most aspects resolve to _published_ packages in the capsule-root store (`@teambit/cli@0.0.1364`)
rather than to the workspace's just-compiled components. The rule turns out to be exactly the right
one. Of `@teambit/bit`'s capsule links, three point at sibling capsules:

- `bit -> ../..` — the self-reference
- `harmony.modules.cli-bundler` — **no version in the dir name**, i.e. new and never tagged
- `workspace.modules.node-modules-linker@0.0.376` — modified in the workspace

and the capsule root holds **53** capsules against a `bit status` of **2 new + 51 modified = 53**.

So: **a new or modified component is built into a sibling capsule and linked fresh; an unmodified one
installs from the registry** - and for an unmodified component the published package _is_ its current
code, which is what "unmodified" means. The bundle therefore carries fresh code for everything that
changed and published packages for everything that didn't, which is correct by construction, and gets
_more_ correct at tag time when everything being released is modified.

The residual risk is narrow and is not a bundling concern: a component whose published version has
drifted from its workspace source while bit still reports it unmodified. That is a workspace-integrity
question.

**Still open from this run:** 4 externals (`webpack`, `@babel/core`, `bufferutil`, `utf-8-validate`)
have no resolvable version because they are genuinely **not declared dependencies of `@teambit/bit`**.
They are marked external, so the bundle does not contain them and the published package must declare
them — a `bit deps set` change, part of §9b rather than a resolver bug. The bundler now warns loudly
instead of dropping them silently. `@teambit/mcp.mcp-config-writer` is likewise not a dependency, so
its runtime template asset is not copied.

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

## 5a. The local install loop on this branch — read before running any install

This cost a full session. The workspace can be driven into a state where **no binary can repair it**,
and the way out is not obvious.

**The two binaries are not interchangeable, and the split is asymmetric:**

- **The bvm release `bit` cannot be used once `@teambit/{node,aspect,env,mdx,readme}` are installed.**
  Release 2.0.72 still has those five in its core-aspect manifest, so it cannot load the workspace's
  envs while real packages by those names exist. It then falls back to a **TypeScript** compiler
  instead of `core-aspect-env`'s **Babel** one — silently, with only a `was not loaded (run "bit
install")` warning per env.
- **`bd` cannot run an install to completion on a populated workspace.** Every `bd install` re-injects
  the workspace packages (`injectWorkspacePackages: true`), deleting every component's `dist/`, and
  the compile that would rebuild them runs last. Anything reached by a _lazy_ require in between dies
  on a dist that existed when the process started.

**Why the tsc fallback is catastrophic rather than cosmetic.** Babel emits lazy requires; tsc emits
eager ones. Eager requires expose a latent cycle — `legacy.analytics` → `config-store` →
`global-config` → `legacy.constants`, whose module body calls `getConfig()` at top level
(`constants.ts:169,234,236,238,250`). `bd` then cannot boot at all. And since the envs can no longer
load, the next compile is tsc again: **the state is self-perpetuating**. Restoring the three modules'
Babel dists from bvm breaks the cycle but not the ESM fallout (tsc dists drag published `@teambit/design.*`
packages through the ESM loader, where their extensionless imports and `.scss` imports both fail).

**The recovery that works.** Incremental repair does not converge; do this:

```bash
mv node_modules .node_modules_old && (rm -rf .node_modules_old &)   # delete alone costs ~10 min
bit install            # RELEASE binary. only a *clean* install repairs env loading; it self-compiles
                       # in-process, which is the only compile that works. ~6 min. leaves the five out.
tar -cf /tmp/dists.tar $(<list of the 328 node_modules/@teambit/*/dist>)   # snapshot while good
bd install             # installs the five, wipes the dists, dies at its own compile step
tar -xf /tmp/dists.tar -C .                                                # restore
bd compile             # bd is the ONLY binary that can compile once the five are installed
```

The snapshot is valid across `bd install` because dists are a function of sources and env, and an
install changes neither. This yields the state nothing else produces: Babel dists **and** the five.

**Two source fixes were needed to get `bd install` that far**, both the same defect in two places —
post-install code treating the expected, transient missing-`dist` window as fatal, aborting the
install before the compile that repairs it. Both are base-branch territory, not bundling; cherry-pick
them onto `remove-core-envs-from-manifest`:

- `dependency-linker.ts` — `syncCoreAspectLinksForEnvs` guarded its trailing `createLinks` but not the
  body that actually throws (a lazy `require('@teambit/aspect-loader')` for `getCoreAspectName`). Its
  own comment already says the bridge is best-effort.
- `workspace-aspects-loader.ts` — core-aspect defs were resolved with an unguarded
  `Promise.all(coreAspectsIds.map(getAspectDef))` that ignored the `throwOnError: false` its caller
  (`InstallMain.reloadMovedEnvs`) explicitly passes.

`bd install` still does not finish: it now reaches its compile step and dies there on
`@teambit/compiler/dist/index.js` lazily requiring `./types`. Fixing that one too would make the whole
loop unnecessary — it is the highest-leverage remaining fix for local dev on this branch.

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
