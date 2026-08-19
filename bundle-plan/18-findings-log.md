# 14. Findings log

[← back to bundle-plan index](../bundle-plan.md)

_(append-only)_

- **2026-08-09** — released bit at `~/.bvm/versions/2.0.72` measures **1.2 GB / 141,008 files**; 678
  packages under `node_modules/@teambit` alone. That is the number to beat.
- **2026-08-09** — core aspects in a released bit live at `@teambit/bit/dist/<name>/` and are
  symlinked into user workspaces by `DependencyLinker.linkCoreAspect`
  (`scopes/dependencies/dependency-resolver/dependency-linker.ts:789`). The bundle must therefore
  produce **directories that look like packages**, not just exports.
- **2026-08-09** — `requireAspects` (`scopes/harmony/bit/load-bit.ts:197`) looked like the blocker,
  but generating `dist/*.aspect.js` + `dist/*.main.runtime.js` stubs in each shim satisfies it
  unchanged. This is what let the whole runtime stay untouched.
- **2026-08-09** — first clean esbuild build: **39 s**, then **11 s** once the resolver plugin cut the
  duplicate module graph.
- **2026-08-09** — `hook-require` was installing `require` on `Object.prototype` under any bundler
  (§6.2). Fixed at the source.
- **2026-08-09** — `bit build --unmodified` completes all 9 tasks from the bundle, Rspack included.
- **2026-08-09** — startup: bundled 1.07 s → **0.61 s** with `module.enableCompileCache()`, vs
  released bit's 0.70 s. Cache dir ~6.6 MB.
- **2026-08-09** — `bit tag`, `bit export` to a local file remote, and `bit import` into a fresh
  workspace all work from the bundle. `bit watch` and `bit server` run.
- **2026-08-09** — SEA binary built and verified (179 MB), but **2× slower to start** than the script
  launcher despite `useCodeCache`.
- **2026-08-09** — adding the UI-bundling externals makes `bit start` reachable but takes the
  distribution from 231 MB to **1.3 GB**. Rejected as a default (§8.3).
- **2026-08-09** — the SEA slowdown is **not** bundle size and **not** the IIFE wrapper (both tested
  and rejected): Node's compile cache does not apply to a main entry script. Same file evaluated as
  main = 0.813 s, via `require()` = 0.390 s. A stub SEA that requires the bundle from disk runs at
  0.642 s, identical to the script launcher (§9.2).
- **2026-08-09** — first CI run failed with `Could not resolve "@teambit/legacy"`. The package is
  declared nowhere in the repo and imported by nothing; the only reference was the bundler's own
  `EXTRA_PACKAGES` list, copied from `bit-bundle2` (which predates the split of legacy into
  `@teambit/legacy.constants`, `@teambit/legacy.logger`, … — all ordinary components that bundle
  normally). It resolved locally purely because a stale v2.1.0 copy sat in a developer's
  `node_modules`. Dropped, and the extras list is now filtered to what is actually installed so a
  missing optional extra warns instead of failing the build. Shims: 108 → 107.
- **2026-08-09** — e2e runners added (`e2e-test:bundle`, `e2e-test:sea`). `./e2e/commands/cat.e2e.ts`
  passes 8/8 against both; per-command cost 0.78 s (script) vs 2.0 s (SEA).
- **2026-08-09** — `ensure-bundle` stamp verified across six scenarios: cold build, warm reuse,
  `--sea` escalation, plain-after-sea reuse, staleness after touching a component's `dist`, and
  `--no-build` failing loudly.
- **2026-08-10** — `webpack` is not dead in this repo: `mdx-env` and `node.node` (both real, shipped
  envs, still used by tracked components such as the aspect-docs generators) resolve their preview
  through `@teambit/preview.react-preview`, which depends on `webpack`/`webpack-dev-server`/
  `@teambit/react.webpack.react-webpack` as live, currently-published packages. Only `react-env` has
  fully migrated to rspack preview. See §15.
- **2026-08-10** — `@teambit/webpack` is registered in `scopes/harmony/bit/manifests.ts:44,160` as a
  dependency of `BitMain` (`bit.main.runtime.ts:9,23`), so it is instantiated on **every** `bit`
  invocation regardless of whether the command touches bundling — this, not actual usage, is why
  `webpack` sits in the CLI bundle's externals unconditionally.
- **2026-08-10** — same eager-load pattern found for Mocha: `@teambit/mocha`
  (`scopes/defender/mocha/mocha.main.runtime.ts:6`) unconditionally imports `MochaTester` from
  `@teambit/defender.mocha-tester`, which does `require('mocha')` at module top level
  (`mocha-tester.js:8`) — so `mocha` loads on every `bit` command too, even though nothing in this
  repo calls `MochaMain.createTester()`. All real consumers (`node-babel-mocha` env, this repo's own
  `cli-bundler` component per `.bitmap:1088-1094`, and `mocha-only-test-env`) import `MochaTester`
  directly from `@teambit/defender.mocha-tester`, bypassing the `@teambit/mocha` wrapper aspect
  entirely.
- **2026-08-10** — `cli-bundler` (this branch's own component, `.bitmap:1088-1094`, set in
  `e441d0b60`) is itself configured with `teambit.node/envs/node-babel-mocha@2.0.4`, i.e. Mocha as
  its tester — the mocha tester is not hypothetical legacy weight, it's wired into the bundling work
  itself today.
- **2026-08-10** — follow-up pass (§15d) corrected the initial §15a/§15b verdicts: `WebpackMain.
createDevServer/createBundler` and `MochaMain.createTester` both have **zero callers anywhere**,
  including in the compiled dist of every downstream package checked. `mdx-env`/`node.node`/
  `react-preview` use raw `webpack` through their own independent, declared dependencies — never
  through the local `@teambit/webpack` aspect. `@teambit/defender.mocha-tester` has zero dependency,
  declared or otherwise, on the local `@teambit/mocha` aspect (`pnpm why @teambit/mocha` → empty).
  Removing both aspects from `manifests.ts` is safe for `bit.app.js`; the only surviving caveat is an
  undeclared (phantom) dependency of the published `@teambit/webpack.webpack-bundler` /
  `@teambit/webpack.webpack-dev-server` packages on three utility exports of `@teambit/webpack`,
  which blocks _fully deleting_ the webpack aspect's source (not just de-registering it) until fixed.
- **2026-08-10** — mocha resolved end to end (§15e): `@teambit/mocha` deleted on
  `remove-core-envs-from-manifest` (`750f930c9`), merged into `bit-bundle3` (`9158ab42a`), `mocha`
  dropped from `cli-bundler`'s externals, rebuild verified `externalsInstalled: 10` (was 11),
  `coreAspects: 105` (was 106), zero `mocha` require sites in `bit.app.js`. `lint` clean on both
  branches; bundled binary smoke-tested (`--version`, `--help`, `init`, `status`).

- **2026-08-11** — `bit start` was broken on this branch **independently of bundling**: `bd start` fails on `Cannot find module 'autoprefixer'`, the bundle on 228 rspack errors. Released bit 2.0.72 serves both pre-bundles in the same workspace instantly, so the pre-bundle path — not the rebuild path — is the one to make work (§17a/§17c).
- **2026-08-11** — the pre-bundle `.hash` is a sha1 over the sorted aspect ids for that runtime, and all three values were reproduced exactly: released 2.0.72 = 5 core + `teambit.react/react` (`11341fbe`), a user workspace on this branch = the 5 core alone (`e23f10da`), this branch's build in bit's repo = 5 core + `teambit.react/react@1.0.1042` (`d3040e74`). `remove-core-envs-from-manifest` took react out of the core aspects, so bit's own repo and every user workspace stopped agreeing (§17b).
- **2026-08-11** — a bundled bit resolved **zero** preview aspects (`currentBundleHash` = sha1 of the empty string): the shims emitted no `*.preview.runtime.js`, and `resolveAspects` drops aspects without one (§17f).
- **2026-08-11** — with core-only artifacts shipped inside the shims, `bit start` works from the default (non-`--ui-bundling`) bundle: HTTP 200 immediately, served from `dist/core-aspects/node_modules/@teambit/ui/artifacts/…`, bit's own rspack never runs. Distribution **1.3 GB → 322 MB**, externals **31 → 12** (§17g).
- **2026-08-11** — the shipped UI artifact measures **90.4 MB**: two independent full browser builds of the same app (22.6 MB `workspace` + 22.6 MB `scope`, only 25 files / 1.9 MB byte-identical between them) plus a **45.2 MB** scope-only SSR build that `bit start` in a workspace never serves. Filed as [teambit/bit#10596](https://github.com/teambit/bit/issues/10596); it is now the largest single item in the distribution (§17h).
- **2026-08-11** — two unrelated resolution bugs blocked the build tasks: `@apollo/client` is a peer of `@teambit/component` and unresolvable from a capsule's pnpm store (fixed with a directory alias — it carries React context, so one copy is required anyway), and `@teambit/cloud.hooks.use-cloud-scopes` declares `"import": "./dist/esm.mjs"` without shipping one — including in the **published** 2.0.72 package (OQ3 biting in practice).
- **2026-08-12** — the CI `bit_pr` job (`node bin/bit.js install`, runs on every non-master branch)
  hit the §11D "third instance" of the transient-missing-dist install bug live: `InstallMain._installModules`
  (`install.main.runtime.ts:505`) reads `CompilationInitiator.Install` off `@teambit/compiler`'s
  barrel (`dist/index.js`), whose re-export of `./types` is a getter that does a fresh `require`
  on every access — right as the preceding package-reinjection step has that dist mid-rewrite, so
  it throws `Cannot find module './types'` and aborts the install _before_ the trailing
  `compileOnWorkspace` call that would have fixed it. A second, compounding symptom rode along:
  once that error escapes, `handleErrorAndExit` (`scopes/harmony/cli/handle-errors.ts`) tries to log
  it and independently needs a fresh resolution of `@teambit/legacy.loader`, which can hit the same
  window and throw too — burying the real error under two garbled "failed to log the error
  properly" lines instead of one clear one. **Fixed**: `InstallMain.getInstallCompilationInitiator()`
  wraps the read in try/catch, falling back to `undefined`; `CompileOptions.initiator` (and the two
  `ComponentCompiler` call sites that read it) made optional to carry that through — safe because no
  compiler plugin reads `.initiator` anywhere in `scopes/`, it's only compared against
  `CompilationInitiator.AspectLoadFail` inside `workspace-compiler.ts` itself, which now defaults a
  missing value from its own already-resolved local import (not the barrel) rather than re-touching
  the risky getter. `npm run lint`: 0 errors. The `handle-errors.ts` secondary-failure fragility is
  still latent for any _other_ trigger of the same window — not hardened here, flagged for later.
- **2026-08-12** — pulled pipeline `48986` / workflow `bb0cac22` directly via the `circleci` CLI
  (`circleci workflow get`, `circleci job output get --step-num 119 --condensed`,
  `circleci testresult list`) rather than guessing from pasted logs. Confirmed byte-for-byte: the
  `bit_pr` step-119 crash is exactly the `CompilationInitiator`/`compiler/dist/index.js:14` getter
  called from `InstallMain._installModules(...install.main.runtime.js:640:33)` diagnosed above — the
  fix already targets the right line. e2e comparison on the **same pipeline** (pre-fix): baseline
  `e2e_test` (`c3dca288`) — **1** failure, a pre-existing root-components nesting test, not bundle-
  related. `e2e_test_esbuild_bundle` (`9a81342f`) — **18** failures, including that same 1. The other
  17 fall into the exact categories §9d already triaged and prioritized — UI/HTTP-remote server (4×
  `http protocol export/import`, 1× lane-export-skip-main-history, 3× `bit ci pr` concurrent-runner
  `before all` hooks), custom-env preview/mdx-bundler externals (2), yarn root-components / plugin-npm
  (2), `node-gyp`, the `get-uid-gid`/shared-flag export pair, and the `bit --help` timing budget.
  **No new, unexplained bundle regressions** — the delta is stable and already has an owner (§11A.2/3).
- **2026-08-12** — the first `bit_pr` fix (previous bullet) was **incomplete**: the very next CI run
  on `bit-bundle3` (`bit_pr` job `8fa95389`, run `4a344309`) crashed again, same `Cannot find module
'./types'`, but at a **different** call site — `workspace-compiler.js:127` inside
  `WorkspaceCompiler.compileComponents` (`:508`), which is exactly the `options.initiator ??
CompilationInitiator.ComponentAdded` fallback the first fix added. That disproves the assumption
  it was written on ("`workspace-compiler.ts`'s own top-level `./types` import is already resolved
  and safe, unlike the barrel's") — confirmed by this evidence that **every** access to
  `@teambit/compiler`'s lazily-bound exports is unsafe during the install's dist-rewrite window,
  regardless of which file inside the package does the reading; `@teambit/compiler` here is a
  workspace-authored core aspect (individually-symlinked source files under
  `node_modules/@teambit/compiler`, real, non-symlinked `dist/*.js` written by `bit compile`), not a
  `.pnpm`-virtual-store package, so `preserve-loaded-virtual-store-dirs.ts`'s peer-hash-rekey restore
  mechanism doesn't cover it — this is bit's own compile step deleting and rewriting its own dist in
  place, not a pnpm relocation. **Real fix**: never dereference `CompilationInitiator` as a fallback
  at all — `initiator` is now `CompilationInitiator | undefined` end to end
  (`CompileOptions`/`TranspileComponentParams`/`compileOneFile`/`compileAllFiles`), so a failed read
  in `getInstallCompilationInitiator()` stays `undefined` all the way through with zero further
  enum access. `npm run lint`: 0 errors. Not yet re-verified against a fresh CI run.
- **2026-08-12** — re-examined the 5 "cheap externals" bundle-e2e failures individually instead of
  batching them; two turned out not to be cheap at all, and the externals.ts list corrected only for
  the genuinely cheap two:
  - **`process/browser`** (1 test, `custom-env-operations.e2e.ts`) — real gap, now fixed. It's not
    bit's own CLI needing webpack; it's `@teambit/webpack`'s config builders
    (`webpack-fallbacks*.ts`) doing `require.resolve('process/browser')` to hand webpack a browser
    polyfill path, for workspaces whose _env_ still uses webpack as its bundler — same "resolved by
    string, must exist on disk" shape `webpack`/`@babel/core` were already accepted for (category C),
    one level deeper and far smaller (a single-file polyfill, no heavy deps). Added to `TOOLCHAINS`.
  - **`uid-number`** (2 tests, `export.e2e.ts` shared-flag group) — real gap, now fixed. `uidNumber()`
    (called from `scope/objects/objects/repository.ts` for `bit export --shared <group>`) spawns a
    _child node process_ on `require.resolve('./get-uid-gid.js')`, a sibling file in the same 4-file
    package — identical shape to the already-externalized `jest.worker`/`typescript` (§6.4), just
    never noticed before because the shared-flag export path is rarely exercised. Added to
    `RUNTIME_PATH`.
  - **`@teambit/mdx.modules.mdx-v3-options`** (2 tests, `custom-env-operations-2.e2e.ts`) — **not a
    gap, working as designed.** Traced the call site: `buildPreBundlePreview()`
    (`scopes/preview/preview/pre-bundle.ts:103`) doesn't just need this one package — it calls
    `rspack(createRspackConfig(...))`, a full rspack compilation that needs the _entire_
    `UI_BUNDLING_EXTERNALS` group (react, `@teambit/react`, the loaders, …). Adding this one package
    to the default build wouldn't even fix the test; it would just fail one `Cannot find module`
    later on the next missing UI package. This is `bit build`/`bit tag --build` hitting the exact,
    deliberate D10/D15 tradeoff — an env with its own preview/bundler config is the "hash misses the
    shipped pre-bundle" case, and the rebuild fallback stays off by default on purpose (costs 231MB→
    1.3GB, §8.3). Left alone; folded into the same known-limitation bucket as the UI-server failures
    below, not tracked as a missing external.
  - **`@yarnpkg/plugin-npm`** (yarn root-components tests) — not investigated further; per product
    direction yarn support is being removed from the bundle entirely, see the next bullet.
    `npm run lint`: 0 errors after the externals.ts change. Not yet re-verified against a fresh CI run.
- **2026-08-12** — root-caused `node-gyp` (§9d/§10 item, `node-gyp.e2e.ts`, exit 127). Bit already has
  a purpose-built mechanism for this exact problem: `addNodeGypToPath()`
  (`scopes/dependencies/pnpm/node-gyp-bin.ts`) — pnpm's engine ships no `node-gyp` of its own, so any
  native package with an `"install": "node-gyp rebuild"` script needs one put on `PATH` by hand.
  It does `require.resolve('node-gyp/bin/node-gyp.js')` to get an absolute path, writes a tiny shell
  wrapper that execs `node <that path>`, and prepends the wrapper's directory to `PATH` before pnpm
  spawns install scripts. `node-gyp` is **not** in `externals.ts`, so esbuild inlines it into
  `bit.app.js` — and an inlined module has no on-disk file for `require.resolve()` to point at, so
  `writeShims()` throws, is caught (by design — "not fatal on its own", the function only warns and
  returns), and no wrapper is ever written. `node-gyp rebuild` then finds nothing on `PATH` at all →
  exit 127. Exactly the same shape as `typescript` (`tsserver.js` by path) and the `uid-number` fix
  above — `node-gyp` needs `RUNTIME_PATH`, not a special case. **Not applied** — investigation only,
  per instruction; the one-line `externals.ts` addition (`RUNTIME_PATH.push('node-gyp')`, same shape
  as the two additions above) is ready whenever it's wanted.
- **2026-08-12** — looked into the `bit --help` timing budget miss (2221ms vs 1500ms in CI,
  `filesystem-read.e2e.ts`) before assuming it's cache warm-up. `enableCompileCache()` uses no
  explicit directory (`generate-bin.ts:24`), so it defaults to Node's own cache dir under `tmpdir()` -
  process/machine-global, not tied to `cwd`. `e2e-command-helper.ts`'s `runCmd` spreads
  `...process.env` unmodified into every spawned command (no per-test `HOME`/`TMPDIR` override), and
  the timing test already runs _after_ a sibling test in the same `describe('bit --help')` block that
  also invokes `bit --help` (with `BIT_DEBUG_READ_FILE` set) - so in theory the cache should already
  be warm by the time the timed call runs, and the 2221ms may not be a cold-start artifact at all.
  Rather than guess, added an explicit warm-up `bit --help` call immediately before the timed one (a
  fresh, identical, back-to-back call with nothing else running in between), per instruction, so the
  next CI run answers empirically: if the _second_ call still misses budget, the regression is real
  and worth chasing (candidates: CI container fs/CPU noise, or the compile cache not actually
  persisting for a reason the above didn't surface); if it passes, this was one-time cost and the
  test's ordering (not the bundle) was the problem. Not yet re-verified against a fresh CI run.
- **2026-08-12** — the yarn root-components e2e failures (`app root components (yarn)` / `root
components for scope aspect capsules using Yarn`, both in `root-components-yarn.e2e.ts`) are
  **ignored, not fixed**: yarn is being dropped as a supported package manager entirely, so
  `@yarnpkg/plugin-npm` is not being pursued as an externals gap (§8.1/§16 already treat webpack as
  the only package-manager-adjacent toolchain worth carrying). Both describes are now `describe.skip`
  with a comment pointing here, matching how every _other_ yarn-package-manager describe in this repo
  (`node-linker.e2e.ts`, `dependency-resolver.e2e.ts`, `pkg-manager-config.e2e.ts`,
  `deps-in-capsules.e2e.ts`, `root-components-envs.e2e.ts`) is already skipped — this was the one file
  still exercising it. Skipped unconditionally (not bundle-only): since yarn support is going away
  regardless of bundling, there is no ongoing value in keeping it green under the _normal_ suite
  either. Remove the two `describe.skip`s (and this file, if nothing else in it survives) once yarn
  package-manager support is actually removed from the codebase.
- **2026-08-12** — built reusable infra for the 8 "failed to start the UI server" bundle-e2e failures
  (§9d), instead of fixing them one at a time. Traced the spin-up mechanism (an Explore agent mapped
  it first): two independent implementations both spawn a `bit start` server as test scaffolding —
  `e2e/http-helper.ts`'s `HttpHelper` (used by `http.e2e.ts` ×4 and `ci-commands.e2e.ts` ×3) and a
  hand-rolled `startBitServerInScope()` in `lane-export-skip-main-history-http.e2e.ts` (its own
  comment already explains why it doesn't reuse `HttpHelper`: hardcoded port/path). Both used
  `helper.command.bitBin` for the server, which is the bundle during a bundle e2e run - conflating
  "does the bundle's `bit start` work for an arbitrary remote scope" (a separate, currently-
  unsupported-by-default question, D15) with what these tests actually exercise: import/export over
  HTTP, with the bundle as the _client_. Addressing (`http://localhost:<port>`) and readiness (a
  stdout string match) are both binary-agnostic, so swapping only the server's binary is safe.
  - Added `CommandHelper.nonBundledBitBin` (`components/legacy/e2e-helper/e2e-command-helper.ts`) -
    the same fallback `getBitBin()` already used before its `npm_config_bit_bin` override, factored
    out so it's available even when that override is set. A no-op outside a bundle run (the two
    fields are equal there).
  - `HttpHelper` gained a `serverBin` constructor param defaulting to `nonBundledBitBin`, used at
    every spawn/match site (`start()`, `isBitServerProcess()`). All 7 existing `new HttpHelper(helper)`
    call sites needed no changes - they pick up the fix automatically, which is the "infrastructure
    for future tests too" the fix was asked for: any _future_ `HttpHelper` use gets correct behavior
    by default, with an explicit override still available if a test ever wants to exercise the
    bundle's server specifically.
  - `lane-export-skip-main-history-http.e2e.ts`'s one call site changed from `bitBin` to
    `nonBundledBitBin`, with a comment explaining why.
  - Verified `nonBundledBitBin` actually resolves to something real in CI: `e2e_test_esbuild_bundle`
    puts the bundle on `PATH` as `bit-bundled` (`.circleci/config.yml:1152-1164`) and runs
    `e2e_test_cmd`, which includes the shared `bit_global_for_npm` command
    (`.circleci/config.yml:260-269`) - the same one `bit_pr` uses - linking the plain, non-bundled
    `bit.js` launcher to `PATH` as `bit`. So `getNonBundledBitBin()`'s fallback (`'bit'`, reached via
    the "invoked through mocha" branch) is a real, working binary in that job, not a dangling name.
    `npm run lint`: 0 errors. Not yet re-verified against a fresh CI run.
- **2026-08-12** — the second `bit_pr` fix (§14, same day, "the first fix was incomplete") was
  _itself_ still incomplete. The next CI run on `bit-bundle3` (`bit_pr` job `dcccc061`, run
  `0ee0147f`, commit `a15fa1b`) crashed a **third** time, same `Cannot find module './types'`, same
  frame (`workspace-compiler.js:127` inside `WorkspaceCompiler.compileComponents`, now at `:503`).
  Root cause: `compileComponents` itself has `if (options.initiator === CompilationInitiator.AspectLoadFail)`
  (`workspace-compiler.ts:496`) as its first statement — `===` evaluates **both** operands regardless
  of the left one, so this reaches the same unsafe lazy getter even when `options.initiator` is
  `undefined`. Two rounds of "make the value optional" fixes both missed this because it isn't a
  _write_ of `CompilationInitiator` anywhere, it's a _read_ sitting in a comparison, and neither prior
  pass grepped for every `CompilationInitiator.<Member>` reference in the whole call path - they each
  fixed the one call site that had just been observed crashing. **Fixed properly this time** by
  grepping `workspace-compiler.ts` for every remaining `CompilationInitiator.` reference and confirming
  each one is unreachable from the install path or safely short-circuited: added `options.initiator !==
undefined &&` before the comparison, so the RHS is never evaluated when `initiator` is absent.
  `npm run lint`: 0 errors. Not yet re-verified against a fresh CI run - this is attempt #3 for this
  specific bug, which is the "3+ fixes failed, question the architecture" threshold; logged here
  explicitly in case a 4th instance turns up, rather than assuming attempt #3 is the end of it.
- **2026-08-12** — applied the `node-gyp` externals fix that had been left as investigation-only:
  added to `RUNTIME_PATH` in `externals.ts`, same shape as `uid-number`/`typescript`. Not yet
  rebuilt/verified locally or in CI.
- **2026-08-12** — reproduced the `process/browser` failure locally end to end (`bd compile` +
  `npm run e2e-test:bundle -- ./e2e/harmony/custom-env-operations.e2e.ts --debug`, workspace kept on
  disk) instead of reasoning about it from e2e logs alone. Two findings, one of them a correction:
  - The fix from earlier today (`process/browser` in `TOOLCHAINS`) **does work** - rebuilding the
    bundle from freshly-compiled `dist/` (the previous local `/tmp/bit-bundle` predated the source
    change and silently reused its stale stamp) got past that specific error.
  - It then failed on the **next** missing module, `Cannot find module 'buffer/'`. Reading
    `webpack-fallbacks.ts` end to end (not just the one line that happened to throw) shows it
    `require.resolve()`s a **full webpack-5 browser-polyfill set - ~21 packages** (`assert/`,
    `buffer/`, `constants-browserify`, `crypto-browserify`, `domain-browser`, `stream-http`,
    `https-browserify`, `os-browserify/browser`, `path-browserify`, `punycode/`, `process/browser`,
    `events/`, `querystring-es3`, `stream-browserify`, `string_decoder/`, `util/`,
    `timers-browserify`, `tty-browserify`, `url/`, `vm-browserify`, `browserify-zlib`) **eagerly, all
    at once**, so the module throws on whichever one esbuild happens to resolve first and would
    throw on each of the rest in turn, one e2e failure at a time, if "add the missing one" were
    repeated blindly.
  - **Tried adding all 21 to `TOOLCHAINS`, then reverted it** (instructed not to): confirmed all 21
    resolve fine locally, so it would have "worked" mechanically, but that's not the same question as
    whether it's _right_. The real question, still open: why does tagging/building a trivial
    old-format env-aspect component (`node-env-1`, a bare `{name, __getDescriptor}` object with no
    `getBundler` of its own) reach `@teambit/webpack`'s full browser-polyfill machinery at all. Not
    yet traced past "`_WebpackMain.createBundler` → `createConfigs` → `configFactory` →
    `webpackFallbacksAliases`" (the e2e stack trace) to _whose_ `getBundler()` this is - most likely
    whatever env `teambit.harmony/aspect` (bit's built-in env for building aspect/extension
    components, still core) uses for previewing an aspect component, but that link is not yet
    confirmed by reading the source, only guessed from the stack shape. Externals.ts left at just
    `process/browser` (the confirmed-necessary, already-verified-working one) with a comment pointing
    here, pending that investigation.
  - **Reverted** a from-first-principles attempt to add the full ~21-package `webpack-fallbacks.ts`
    polyfill set to `externals.ts`: all 21 resolve fine locally and it mechanically works, but was
    reverted on instruction before pushing. "Why does this trivial fixture need webpack's full
    browser-polyfill surface at all" is a better question to answer than "which package is still
    missing", and stays open.
- **2026-08-12** — the third `bit_pr` fix (previous entries, same day) got past the
  `CompilationInitiator` crash entirely - confirmed by the next CI run (`bit_pr` job `fefc434d`, run
  `bf3c6ae0`, commit `8eb67a7`) failing on a **different, unrelated** file for the first time. New
  crash: `Component.isComponentInvalidByErrorType` (`consumer-component.ts:425`) throws
  `Cannot find module './exceptions/main-file-removed'` while classifying an error inside
  `ComponentLoader.loadOne`'s `handleError` - same install-time transient-dist-window symptom
  (a named cross-component import compiling to a per-property lazy-`require` getter, unsafe while
  pnpm's `injectWorkspacePackages` is mid-rewrite), completely different subsystem
  (`@teambit/legacy.consumer-component`, not `@teambit/compiler`). This is the "3+ fixes failed"
  threshold from the debugging process - instead of a 4th narrow patch, traced it one level up and
  found the actual architectural gap: `WorkspaceAspectsLoader.importAndGetAspects`
  (`workspace-aspects-loader.ts:1080`) has an unconditional `throw err` in its catch block that
  **ignores its own `throwOnError` parameter** - the exact class of defect `resolveCoreAspectDefs`
  in the same file was already fixed for (5f50bc2d5) and documents in its own comment, just present
  in a sibling method that fix didn't reach. `reloadMovedEnvs` passes `throwOnError: false` through
  `resolveAspects` expecting best-effort behaviour; `importAndGetAspects` didn't honour it, so the
  classifier's incidental crash escaped anyway and aborted the install regardless of the flag. Its
  sibling `loadFromScopeAspectsCapsule` already gets this right (falls through to a best-effort
  return); `importAndGetAspects` now matches it - `throwOnError` false → log + return `[]`, `true` →
  unchanged. **Also hardened the direct trigger** (defense in depth, not just the one caller):
  `isComponentInvalidByErrorType` now wraps its classifier-array construction in try/catch, returning
  `false` (i.e. "not a recognized invalid-component type", same as a genuine non-match) instead of
  crashing, so `handleError` re-throws the _original_ error unchanged rather than a secondary,
  more confusing one - independent of which caller reaches it or what `throwOnError` is set to.
  `npm run lint`: 0 errors. Not yet re-verified against a fresh CI run - attempt #4 for this bug
  class; if a 5th instance turns up, that is a strong signal to stop patching call sites and instead
  question whether `injectWorkspacePackages` (or the timing of compile relative to it) is the thing
  that should change.
- **2026-08-13** — removed `uid-number` from `RUNTIME_PATH` in `externals.ts`. PR #10609 (merged
  2026-08-12) replaced `scope/objects/objects/repository.ts`'s use of `uidNumber()` with a direct,
  in-process read/parse of `/etc/group` and dropped the dependency from `workspace.jsonc`, so the
  `get-uid-gid.js` child-process spawn this entry existed for (§8.1, §14 2026-08-12) no longer
  happens - `uid-number` isn't referenced anywhere in source anymore, only as a stale transitive
  entry in `pnpm-lock.yaml`. `node-gyp` and `typescript` remain in `RUNTIME_PATH` for the same
  by-path-require shape.
- **2026-08-13** — traced why §11 A.1's "resolve from the pre-bundled artifact, like §17" doesn't
  drop straight onto the `@teambit/mdx.modules.mdx-v3-options` gap (§9d row 2, §14 2026-08-12).
  `writePreviewEntry` (`preview.main.runtime.ts:880-922`) is the single hash-gated fast path §17
  built: it serves the shipped pre-bundle only when `currentBundleHash === preBundleHash`, and that
  artifact was deliberately baked against a **fixed, env-agnostic set** - bit's 5 core aspects
  (§17d option (a)) - specifically so an ordinary workspace's UI root would predictably match it.
  `EnvPreviewTemplateTask.getEnvTargetFromComponent` (`env-preview-template.task.ts:152`) calls the
  same function but passes `aspectsIdsToNotFilterOut: [envComponent.id.toString()]`, and the inline
  comment there explains why: the env's own aspect must be folded into the preview-root bundle "to
  make sure its providers registered there are running correctly." `filterAspectsByExecutionContext`
  (`preview.main.runtime.ts:1016-1027`) then force-includes that id. So for this call site the
  resolved aspect set is never the fixed 5 - it always includes a workspace/env-specific aspect the
  shipped artifact could not have been built against - and `currentBundleHash` can structurally never
  equal `preBundleHash`. This isn't a coverage gap in the existing fast path (like "workspace uses
  react, artifact only has 5 aspects," §17d's noted remaining limitation); it's a different shape of
  input entirely, so §17's exact mechanism (ship one static pre-bundle, hash-gate against it) cannot
  be reused unchanged here. Extending the fix needs one of: (a) decouple "the env's providers must
  run" from "the env's aspect must be rspack-compiled into the shared preview-root bundle" so the
  fixed-5 artifact can still be served and the env wired in some other way, or (b) have
  `buildPreBundlePreview`'s rspack run resolve react/mdx/the loaders from the _user's workspace_
  `node_modules` instead of bit's own installation - which is arguably why a released, non-bundled
  bit never hits this: it isn't avoiding the rebuild, its own `node_modules` already has the full
  tree. Neither is implemented; this is genuinely open design work, not a small follow-on to §17.
- **2026-08-13** — **correction to the bullet above**, from actually instrumenting and running the
  `EnvPreviewTemplateTask` codepath (temporary `console.log` in `writePreviewEntry`'s "do build"
  branch, `bd compile` + `npm run bundle`, then `npm run e2e-test:bundle -- ./e2e/harmony/custom-env-
operations-2.e2e.ts --debug`, then the failing `bit build` re-run directly against the kept
  workspace so stdout survives - `CommandHelper.runCmd`'s `execSync` swallows stdout on a thrown
  error, only `.message`/stderr reaches the mocha failure text). Two calls into `writePreviewEntry`
  happen during this build, not one:
  - **comp1's own `GenerateEnvTemplate` (task 9/18, 449μs)** never reaches `writePreviewEntry` at
    all - `EnvPreviewTemplateTask.execute()` calls `getBundlingStrategy(envDef.env)` first
    (`env-preview-template.task.ts:72-75`), and `react-no-compiler-env` (extends `ReactEnv`) reports
    strategy `'env'`, so the task returns `undefined` immediately. **Envs with their own
    `getTemplateBundler` skip bit's shared preview-root mechanism entirely** - no mdx, no rspack, no
    externals problem, confirmed by the 449μs no-op.
  - **The env component's own `GenerateEnvTemplate` (task 16/18, `[dependency] (env)`)** is the one
    that reaches `writePreviewEntry` and fails - `react-no-compiler-env` itself has no configured env
    of its own, defaults to `teambit.envs/env` (`shouldUseDefaultBundler` true), which has no
    `getTemplateBundler`. Logged both `resolvedAspects` (pre-filter) and `filteredAspects` (what's
    actually handed to `buildPreBundlePreview`):
    - `resolvedAspects` (6): `teambit.react/react@1.0.1042` (`isCore: false`, resolved from the
      **workspace's** `node_modules`) + the 5 core aspects (`preview`, `docs`, `compositions`,
      `pubsub`, `command-bar`, all `isCore: true`, resolved from `/tmp/bit-bundle`'s own
      `node_modules`) - confirms §17b's "a workspace using a react env resolves 6."
    - `filteredAspects` (5): **only the 5 core aspects. `teambit.react/react` is dropped by
      `filterAspectsByExecutionContext`** - it's not in the env component's own attached-aspects
      list, not in harmony's host config, and not in `aspectsIdsToNotFilterOut` here (that array
      holds `react-no-compiler-env`'s own id, not react's).
  - **The consequence changes the fix.** `currentBundleHash` (line 885) is computed from the
    unfiltered 6-aspect `resolveAspects()` result (`createBundleHash(uiRoot, RUNTIME_NAME)`), so it
    mismatches `preBundleHash` (baked from the fixed 5) and forces the "do build" branch. But the
    _filtered_ content that branch actually builds is - in this case - **identical to the already-
    shipped core-5 artifact**. So this specific failure is a **false-negative hash check**, not a
    real content difference: the rebuild this triggers would (mdx-v3-options crash aside) almost
    certainly reproduce what's already on disk. The two-part "core pre-bundle + env-specific pre-
    bundle, stitched together" design floated as a next step is more machinery than this case needs -
    **the smaller, more targeted fix is computing `currentBundleHash` from the same (or an
    equivalently) filtered aspect set `buildPreBundlePreview` actually consumes**, instead of the raw
    UI-root resolution. That would make this exact scenario (a workspace using react-env _anywhere_,
    while the failing component's own env doesn't) correctly hit the existing fast path and never
    reach `buildPreBundlePreview` at all. Not yet verified whether every env hitting this branch
    filters down to the fixed 5 the same way, or whether some legitimately need extra aspects baked
    into the shared root (in which case the hash-on-filtered-set fix would correctly still rebuild for
    those) - that generalization is the next thing to check before implementing it.
- **2026-08-13** — **implemented** the fix from the bullet above. `writePreviewEntry`
  (`preview.main.runtime.ts:880-`) now resolves aspects once, computes both `currentBundleHash`
  (unchanged, raw) and a new `currentCoreBundleHash` (`hashAspects(filterCoreAspectDefs(resolvedAspects))`
  - the exact same call `PreBundlePreviewTask` uses to hash the artifact it ships), and the
    pre-bundle branch now accepts either match:
    `currentBundleHash === preBundleHash || currentCoreBundleHash === preBundleHash`. Also switched the
    debug-logging and "do build" branch to reuse the single `resolvedAspects` resolution instead of
    re-resolving (`getBundleAspectIds`/a second `resolveAspects` call), since `generateBundleHash`'s own
    comment already establishes the principle ("hash the aspects the caller actually bundled, rather
    than re-resolving them"). `bd compile teambit.preview/preview` + `npm run bundle`: 0 errors.
    **Caveat on local validation**: this repo's own `npm run bundle`/`bundle:ensure` flow (same one
    `setup_esbuild_bundle` runs on CI, confirmed by reading `.circleci/config.yml`) never runs
    `teambit.preview/preview`'s own `PreBundlePreviewTask` first, so `getAspectDir('teambit.preview/preview')`
    finds no local `artifacts/` and `getAspectArtifactDir` falls back to `getAspectDirFromBvm` - a real
    bvm-installed release on the machine running the bundle. Locally that resolved to a **stale** bvm
    install (2.0.74 and older, predating `remove-core-envs-from-manifest`), so `preBundleHash` there is
    a 6-aspect hash pinned to an old `teambit.react/react` version neither `currentBundleHash` nor
    `currentCoreBundleHash` can ever equal - meaning the target e2e test still fails locally, for a
    reason unrelated to whether the fix is correct. CI's `setup_harmony` job runs `bvm_upgrade` (fetches
    the _latest released_ bit) before `setup_esbuild_bundle` runs, so CI's fallback artifact is far more
    likely to already reflect the post-core-env-removal 5-aspect scheme this branch computes - which is
    the plausible reason `bit start`'s hash check already succeeds on CI (§7.1) despite the same "no
    local artifact" gap. Did not `bvm upgrade` the local machine to test this, to avoid mutating shared
    global state for an investigation. **Not yet verified against a fresh CI run** - the artifact-source
    question (local-build vs bvm-fallback vs the real product build task, §9e) is itself still open and
    is what determines whether this fix is suffient on its own or whether §9e's task needs to ship a
    genuine local artifact before this matters in production.
- **2026-08-13** — investigated the other CI failure the user pointed at (branch PR #10590, CircleCI
  pipeline `bfee21ba`, `e2e_test_esbuild_bundle` build 439879, fetched via the public
  `circleci.com/api/v1.1/project/github/teambit/bit/<build>` endpoint - no token needed, the project is
  public). 3 of 40 parallel containers failed: index 20 is the pre-existing `bit --help` timing-budget
  flake (§9d item 4, unrelated); index 18 is this exact mdx-v3-options gap; **index 4** is
  `custom-env-operations.e2e.ts` "should be able to re-tag with no errors" (`bit tag --unmodified
--build`) failing with `Cannot find module 'buffer/'` from `webpack-fallbacks-aliases.js` -
  literally the next line after `process/browser` in the same 2-entry file
  (`scopes/webpack/webpack/config/webpack-fallbacks-aliases.ts`: `{ process: require.resolve('process/
browser'), buffer: require.resolve('buffer/') }`), exactly as anticipated in the 2026-08-12 TOOLCHAINS
  comment. That comment held off adding it pending an open question: whether fixing it would just be
  the first domino in `webpack-fallbacks.ts`'s ~20-package polyfill list. Resolved: the CI stack trace
  only ever reaches `webpack-fallbacks-aliases.js` (this 2-entry file, consumed by
  `WebpackMain.createConfigs`/`configFactory`) - `webpack-fallbacks.ts`'s 20-entry `fallbacks` /
  `fallbacksProvidePluginConfig` exports are a separate module, consumed by the _preview_ rspack config
  (`rspack.config.ts`), not this codepath. Added `'buffer/'` to `TOOLCHAINS` in `externals.ts`,
  matching the `process/browser` entry's shape and reasoning exactly. `bd compile teambit.harmony/
modules/cli-bundler` + `npm run bundle`: 0 errors. Unrelated to the mdx-v3-options/hash-check fix
  above - different bundler (webpack, not the preview-root rspack build), different trigger (a
  webpack-based env's own bundler config, not `writePreviewEntry`'s hash gate) - the user asked
  whether the hash fix might also cover this one; it doesn't, this is a separate, independently
  root-caused and fixed gap. Not yet re-verified against a fresh CI run.
- **2026-08-13** — ran both e2e specs (`custom-env-operations.e2e.ts`,
  `custom-env-operations-2.e2e.ts`) against a bundle rebuilt with both fixes above
  (`npm run e2e-test:bundle -- <both files> --debug`, 17 passing / 3 failing, 49m). Confirms both
  predictions from the two bullets above exactly:
  - **`buffer/` fix: passing.** "should be able to re-tag with no errors" succeeds -
    `running Webpack bundler. Succeeded in 907ms`, no `Cannot find module` anywhere in that run.
  - **mdx-v3-options fix: still fails locally**, same error as before (`Cannot find module
'@teambit/mdx.modules.mdx-v3-options'`) - exactly the "no real shipped artifact locally" caveat
    predicted above, not a flaw in the fix's logic.
  - **One unrelated, previously-unseen failure**: `custom-env-operations-2.e2e.ts` › "an empty env.
    nothing is configured, not even a compiler" › "bit compile should not compile the component and
    should say why" - expected output to contain `comp1 ... not compiled` but the component compiled
    successfully instead. Not investigated (out of scope for this session, not one of the 3 known CI
    failures, and not touched by either fix here) - flag if it also shows up on a fresh CI run.
  - Looked for a fresher local artifact to unblock validating the mdx fix properly, per a suggestion
    to check the capsule cache (`~/Library/Caches/Bit/capsules/root/*/node_modules/.pnpm/@teambit+preview@*/node_modules/@teambit/preview/artifacts/ui-bundle/.hash`)
    instead of relying on the bvm fallback. Found several cached copies (`@teambit/preview@1.0.1097`,
    3 pnpm-hash variants) - all three carry the **identical** hash `11341fbeaaeecffe80182c203c294aa7d824b59f`,
    dated 2026-08-09 15:41 - i.e. the same old/stale (`react`-included) hash the bvm fallback already
    resolves to, not a fresher one reflecting this branch's 5-core-aspect scheme. No usable fresher
    artifact found this way either; the `bd build teambit.preview/preview` attempt to generate one
    from scratch still fails on the pre-existing capsule/`@teambit/builder` version-mismatch TS errors
    noted below, unrelated to anything in this investigation.
  - **Revalidate once PR [#10610](https://github.com/teambit/bit/pull/10610) merges** (decouples
    `ReactEnv` from `WebpackMain`, routing its bundler/dev-server through the standalone
    `@teambit/webpack.webpack-bundler`/`webpack-dev-server` packages instead): re-run
    `custom-env-operations.e2e.ts` › "should be able to re-tag with no errors" (the `buffer/` test) -
    if `teambit.envs/env` does extend `ReactEnv` as suspected (unconfirmed here - its source isn't in
    this workspace, it's a separately-published package), the default-bundler codepath that test
    exercises would stop calling `WebpackMain.createBundler`/`webpack-fallbacks-aliases.ts` entirely,
    which could make the `buffer/` externals entry unused rather than wrong. Does **not** apply to
    `custom-env-operations-2.e2e.ts`'s mdx-v3-options test - that crash is in `@teambit/preview`'s own
    `buildPreBundlePreview`/rspack path, structurally unrelated to `ReactEnv`/`WebpackMain` regardless
    of #10610.
- **2026-08-13** — **proved the hash-gate fix end to end**, hackily but conclusively, instead of
  waiting on a real shipped artifact. Isolated the failing scenario to its own workspace (`.only` on
  the describe block, `npm run e2e-test:bundle -- ./e2e/harmony/custom-env-operations-2.e2e.ts
--debug`, then reverted the `.only`), captured the exact hash values `writePreviewEntry` computed
  from `~/Library/Caches/Bit/logs/debug.log` (bit always logs debug lines to file regardless of
  console verbosity):
  `currentBundleHash: d3040e74...` (matches §17b's row 3 exactly - this branch's own react version),
  `currentCoreBundleHash: e23f10da...` (matches §17b's row 2 exactly - the intended "5 core, no
  react" value my fix computes), `preBundleHash: 11341fbe...` (the stale bvm 2.0.74 fallback,
  confirming the caveat above - none of the three coincide only because of the missing local
  artifact, not because the fix computes the wrong thing).
  Then planted a fake artifact at the exact path the bundle's own `getAspectDir` resolver checks
  first (`/tmp/bit-bundle/dist/core-aspects/node_modules/@teambit/preview/artifacts/ui-bundle/`):
  a `.hash` file containing the captured `currentCoreBundleHash` value, plus a minimal
  `{"entrypoints": []}` `asset-manifest.json` (enough for `generateBundlePreviewEntry` to not
  crash - the artifact's actual _content_ is irrelevant to what's being tested, only whether the
  hash match correctly skips `buildPreBundlePreview`). Re-ran the identical `bit build comp1
--skip-tasks TSCompiler` directly against the same workspace: **`build succeeded`, exit 0**, task
  16 (`[dependency] (env) [Preview: GenerateEnvTemplate]` - the exact task that crashed before)
  completed via `running Webpack bundler` instead of throwing `Cannot find module '@teambit/mdx.
modules.mdx-v3-options'`. The debug log for this run confirms the mechanism directly:
  `preBundleHash: e23f10da...` (now reading from the planted artifact,
  `preBundlePath: /private/tmp/bit-bundle/...`, no bvm fallback needed) exactly equals
  `currentCoreBundleHash`. Cleaned up the planted artifact afterward
  (`rm -rf .../@teambit/preview/artifacts`). **This closes the open question from the two bullets
  above**: the fix's logic is not just correct by inspection, it demonstrably prevents the crash
  once a real artifact with the right hash exists - the only remaining gap is _producing_ that
  artifact as part of the normal bundle-build flow (still open, see the "artifact-source question"
  note above and §9e).
- **2026-08-16** — merged `origin/remove-core-envs-from-manifest` (the actual base branch - an
  earlier attempt merged raw `origin/master` instead and was aborted once caught; that branch had
  since diverged, e.g. it still has `@teambit/react` core-aspect source this branch deleted).
  `remove-core-envs-from-manifest` had already merged `master` several times and resolved the
  react/aspect-deletion conflicts upstream, so this merge was clean - **zero conflicts**. It brought
  in the full upstream webpack decoupling: `refactor(react): use webpack-bundler/webpack-dev-server
instead of WebpackMain aspect` (#10610) and `refactor(webpack): drop the duplicate bundler/dev-
server runtime from the core aspect` deleted `webpack.bundler.ts` and `webpack.dev-server.ts`
  outright and stripped `WebpackMain.createBundler`/`createDevServer` down to a deprecated,
  type-only compatibility shim - the react/node/aspect envs now bundle component previews through
  the external, per-env `@teambit/webpack.webpack-bundler`/`@teambit/webpack.webpack-dev-server`
  packages (resolved from the component's own capsule `node_modules`), never through bit's local
  `@teambit/webpack` aspect.
- **2026-08-16** — `bit install` post-merge needed **two passes**: the first left `@teambit/bit`
  uncompiled (`dist/` didn't exist yet - `bd`/`bit` both crashed with `Cannot find module
'.../dist/app'`) and printed "Bit was not able to install all dependencies. Please run 'bit
  install' again"; the second pass completed cleanly and compiled 326 components. Matches the
  existing note in §15e about `bd` breaking transiently after a `manifests.ts`-adjacent merge -
  recompiling needs the **released** `bit` (`/Users/giladshoham/bin/bit`, this machine's dev-link
  alias for the bvm-linked 2.0.82), not `bd`, until `dist/` exists again.
- **2026-08-16** — **found a pre-existing, unrelated hang/perf regression** blocking local
  `bd status`/`bd build`/`bd insights circular` on this branch: a non-terminating recursion inside
  `WorkspaceAspectsLoader.loadAspects`, already root-caused and documented by someone else in
  `scripts/circular-deps-check/CI-HANG-INVESTIGATION.md` (brought in by this merge). `bd status`
  timed out at 100s and 590s alike, spinning on the identical `... > consumer-fs-load >
workspace.loadAspects` / `... > extension-merge > workspace.loadAspects` ping-pong the
  investigation doc describes; `bd build teambit.preview/preview --reuse-capsules` hit the same wall
  and never completed inside a 590s window. **Not fixed here** - out of scope for the externals/mdx
  work, tracked separately with its own recommended fix (port `1213c36c6`'s `loadAspects`
  serialization-queue from `origin/refactor/component-loading-v2-take-3-stage2`). Practical
  consequence for this session: any `bd`-driven full-workspace command must budget for this or be
  swapped for the bvm-linked `bit` binary, which is unaffected (it predates this branch's code).
  This is also what blocked producing a real local pre-bundle artifact (§10 gap, §17) - `bd build`
  on `teambit.preview/preview` or `teambit.ui-foundation/ui` cannot currently complete locally to
  generate one.
- **2026-08-16** — **removed `webpack` from `TOOLCHAINS`** in `cli-bundler/externals.ts`. Every
  remaining reference to the `webpack` package anywhere in the repo (`scopes/webpack/webpack/*.ts`,
  `@teambit/webpack.modules.config-mutator`, the two event types) is `import type`, erased at
  compile time by `tsc` before esbuild ever sees it - grepped the entire repo, confirmed. Rebuilt
  with the entry removed: 0 errors, 0 unresolved-externals warnings, and a direct grep of the emitted
  `bit.app.js` for `require("webpack")` returns zero matches.
- **2026-08-16** — **removed `process/browser` and `buffer/`** from `TOOLCHAINS` too, prompted by the
  question of whether they were still needed now that `WebpackMain.createBundler` (their original
  call site, `webpack-fallbacks-aliases.ts`) is gone. Verified empirically, not just by static
  analysis (the bundle still contains literal `require.resolve("process/browser")` /
  `require.resolve("buffer/")` calls from `webpack-fallbacks.ts`/`webpack-fallbacks-aliases.ts`,
  reached via `@teambit/preview`'s own `pre-bundle.ts` → `rspack.config.ts` import chain and
  `@teambit/webpack/index.ts`'s re-export - esbuild leaves both as unresolved runtime calls with an
  explicit "should be marked as external for use with require.resolve" warning either way, so
  static analysis alone couldn't settle whether they're actually _reached_). Rebuilt with both
  removed, pruned them from `/tmp/bit-bundle/node_modules` (`npm install` alone doesn't remove
  extraneous packages - needed an explicit `npm prune`), then re-ran the exact e2e test this entry
  was originally added for: `custom-env-operations.e2e.ts` "should be able to re-tag with no
  errors" (`bit tag --build`, §14 2026-08-13's original repro). **Passes** -
  `running Webpack bundler. Succeeded in ~500-800ms` with neither package anywhere near the bundle,
  confirmed by `ls node_modules/{buffer,process}` returning nothing. Root cause of why it's safe now:
  the same upstream refactor above moved this test's preview-bundling off `WebpackMain.createBundler`
  entirely, onto the external `@teambit/webpack.webpack-bundler` package - the crash site this
  externals entry existed for is now unreachable from that test.
  **Not fully proven dead**, though: `@teambit/preview`/`@teambit/ui`'s own rspack configs still
  `import { fallbacks } from '@teambit/webpack'` (`webpack-fallbacks.ts`, unaffected by the #10610
  refactor - it's bit's own preview/UI _rebuild_ fallback, not the env's bundler). Tried to reach
  that path directly via `custom-env-operations-2.e2e.ts`'s `react-no-compiler-env` scenario (the
  same test used to validate the hash-gate fix, below) - it crashes earlier, on the unrelated,
  still-open `@teambit/mdx.modules.mdx-v3-options` gap, before ever reaching the `fallbacks.process`
  line. So this residual path could not be exercised end-to-end this session; documented as an open
  risk directly in `externals.ts` with the exact symptom to watch for if it turns out wrong.
- **2026-08-16** — re-ran `custom-env-operations-2.e2e.ts`'s `react-no-compiler-env` scenario (the
  mdx-v3-options / hash-gate test) against the fully merged + externals-trimmed bundle. **Still
  fails** with `Cannot find module '@teambit/mdx.modules.mdx-v3-options'`, same as before the merge.
  Expected, not a regression: local validation of the hash-gate fix (`currentCoreBundleHash`,
  committed `e8cb82ef3`) has been blocked since 2026-08-13 by the same root cause - no real local
  `@teambit/preview` artifact exists (`npm run bundle` reports `"shipped artifacts": none`, and
  producing one via `bd build` is now additionally blocked by the hang bug above), so
  `getAspectArtifactDir` falls back to a stale bvm-installed bit predating
  `remove-core-envs-from-manifest`, and neither hash can ever match it. The fix's logic was already
  proven correct via a planted-artifact test (§14 2026-08-13); this session re-confirms the _local_
  environment still can't validate it end-to-end, and CI (fresher bvm fallback via `bvm_upgrade`,
  §9d) remains the place this actually gets proven.
- **2026-08-16** — **investigated why the bundle grew** (66.58 MB at the last recorded measurement,
  §9d, → 78.3 MB now), prompted by a direct question. No prior metafile exists to diff against, so
  this isn't a full "what changed" accounting - most of it is plausibly ordinary dependency drift
  across the ~150k-line `pnpm-lock.yaml` regeneration this merge brought in. But walking the current
  `metafile.json`'s `inputs[*].imports` turned up one concrete, actionable, pre-existing (not
  introduced this session) contributor: **the real `webpack` npm package - 694 files, 6.95 MB - is
  fully inlined**, despite `webpack` itself having zero legitimate reason to be in the bundle (see
  the entry right above this one). Traced why: `@teambit/ui/dist/rspack/rspack.browser.config.js`
  imports `workbox-webpack-plugin` (for `bit start`'s service-worker generation) and
  `@teambit/ui/dist/ui-server.js` imports `@rspack/dev-server` - both tiny themselves (36 KB / 139 KB)
  but both internally `require()` real `webpack` for their own compat/type needs. `@rspack/dev-server`
  is nominally in `UI_BUNDLING_EXTERNALS` (§8.3's opt-in, off-by-default group) but that only controls
  whether it's marked **external** for `--ui-bundling` builds - it does nothing to stop the **default**
  build from inlining it, since `ui-server.ts`/`rspack.browser.config.ts` are unconditionally reachable
  from `@teambit/ui`'s always-loaded main runtime. So today's default (non-`--ui-bundling`) bundle
  already pays ~7 MB for dev-server/service-worker machinery that (per §17) `bit start` doesn't even
  use anymore - it serves the pre-bundle instead. Not fixed here (out of scope for this session), but
  it's a concrete instance of §8.2 item 5's "audit the bundle's own size" lever, and a stronger
  candidate than that item previously had specifics for: making `ui-server.ts`'s dev-server import lazy
  (or splitting the service-worker/dev-server code out of the always-loaded `UiMain` module graph)
  would recover roughly this much for free, independent of the `@rspack/core`/`typescript`/`@babel/core`
  externals-vs-inlined question below.
- **2026-08-16** — **removed `@babel/core`** from `TOOLCHAINS` too, but this one needed to be
  understood precisely rather than just tested-and-shipped like the three above, because §19b
  (2026-08-12) had already done the rigorous version of this investigation and concluded `@babel/core`
  "stays in externals.ts... removing it now would break aspect-loader". Re-checked both of §19b's two
  reachability paths: the `version.ts` → `react-docgen` path is gone on its own (`react-docgen` no
  longer exists anywhere in the source tree - presumably removed by an unrelated upstream change
  between 08-12 and now). The `aspect-loader.main.runtime.ts` → `@teambit/compilation.modules.babel-
compiler` → `@babel/core` path is exactly as `@19b` described it and **is still real** - confirmed,
  not disproven. The distinction that makes removal safe anyway: unlike `process/browser`/`buffer/`
  (which are `require.resolve()` calls esbuild can never fold, since the returned path is
  environment-dependent - an unmarked one is always left as a live, currently-unsatisfiable runtime
  lookup), `@babel/core` is an ordinary `require()`, which esbuild inlines like any other reachable
  module when not marked external. Checked what actually got inlined rather than assuming a trivial
  stub: the **full working transform engine** - `transform.js`, `transformation/index.js`,
  `config/full.js`, plugin/config loading, ~230 KB across ~50 files, not dead code. Rebuilt with the
  entry removed and pruned from `node_modules`, then re-ran `custom-env-operations.e2e.ts` "should be
  able to re-tag with no errors" end to end: passes, including its own `[Compiler: BabelCompiler]
compile components for artifact dist` task - a _different_, separately-published component-compiler
  package (`@teambit/compilation.babel-compiler`, distinct from `@teambit/compilation.modules.babel-
compiler` above), resolved from the env's own capsule `node_modules` with its own `@babel/core`
  either way. **Net effect, precisely stated**: this is not a dead-code removal like `webpack` - bit's
  own `aspect-loader` genuinely still uses `@babel/core` on every invocation - it's a "stop installing
  it as a separate ~17 MB package when esbuild already inlines the ~230 KB that's actually reachable"
  change. Externals count: 11 (was 12, was 14 before today, was 16 before `webpack`/`process`/`buffer`
  earlier today).
- **2026-08-16** — the fresh CI run for this session's merge+externals changes confirmed
  `filesystem-read.e2e.ts`'s `bit --help` timing budget miss is still failing (1821ms vs the 1500ms
  budget) - closes the open loop left at 2026-08-12 above ("if the second call still misses budget,
  the regression is real"): **it is real**, and not a regression from anything in this session
  (removing externals only reduces work, if anything). Investigated the two candidates that entry
  named:
  - **"compile cache not actually persisting"**: disproven. Locally, the on-disk cache directory
    (Node's default, machine-global, shared across every process - found **65,791 files / 429 MB**
    accumulated on this dev machine) genuinely works: cold `bit --help` ~1.4-1.5s, warm ~0.7-0.8s,
    a real ~2x speedup, confirmed with `time` across repeated runs. Tested whether the giant shared
    directory's lookup cost was itself the problem (a plausible alternate theory) by pointing
    `NODE_COMPILE_CACHE` at a small, freshly-isolated directory instead - **identical warm timing**
    either way. So caching itself is not broken, on this machine at least.
  - **"CI container fs/CPU noise"**: the more likely explanation, by elimination. `bit --help` is not
    like `bit --version` (§9.1: "`--version` short-circuits before the aspect graph is evaluated") -
    generating the help text requires enumerating commands from all ~104 core aspects, so its warm
    floor is dominated by **execution** cost (Harmony bootstrap + aspect registration), not parse
    time - compile caching only ever addressed the parse-time half of the cost. Local warm is
    ~750-790ms; CI's 1821ms implies roughly 2.3x the per-operation cost, consistent with ordinary CI
    container overhead (shared vCPUs, cgroup throttling) rather than a bug specific to this bundle.
  - Measured `--minify` (§8.2 item 6, previously unmeasured) as a possible mitigant: 78.3 MB → 39.6 MB,
    warm `bit --help` ~770ms → ~700ms locally (~9%). Real, but not proportionally enough to obviously
    close CI's gap on its own if it scales linearly.
  - **Decision: documented, not fixed this session.** The real fix candidate - making `--help`
    short-circuit before loading the full aspect graph, the way `--version` does - is a CLI-behavior
    change outside bundling scope, bigger and riskier than anything else touched today. Shipping
    `--minify` by default was considered and explicitly deferred (user call) rather than taken as a
    partial fix now.
- **2026-08-16** — **genuinely excluded `@rspack/dev-server` and `workbox-webpack-plugin`** from the
  bundle - not moved to `externals.ts` (which would still cost install size, the user's explicit
  ask), but stubbed via a new esbuild plugin (`plugins/stub-dev-only-plugin.ts`, same `onResolve`/
  `onLoad` pattern as `ignore-assets-plugin.ts`), so neither their own code nor the real `webpack`
  package they each independently `require()` internally (the ~7 MB found earlier this session) ever
  gets bundled. Confirmed both are safe to eliminate entirely, not just move around, by tracing exact
  reachability before touching anything:
  - `@rspack/dev-server`'s only consumer, `RspackDevServer`, is constructed inside `UIServer.dev()`
    (`ui-server.ts:330`), called only from `ui.main.runtime.ts:407`'s `if (dev) { ... }` branch -
    i.e. only `bit start --dev`, already out of scope (OQ2).
  - `workbox-webpack-plugin`'s only consumer, `WorkboxWebpackPlugin.GenerateSW`, is constructed
    inside `createRspackBrowserConfig` (`rspack.browser.config.ts:125`) - the UI rebuild-fallback
    path, already opt-in/off by default (`--ui-bundling`). Traced further: that same function calls
    `resolveAlias()` (`rspack.common.ts`) _before_ reaching the workbox line, which does
    `require.resolve('@teambit/code.ui.code-editor')` and five more `UI_BUNDLING_EXTERNALS` packages
    - none installed in the default build - so this path was **already throwing earlier in the same
      function**, before this change, every time. Stubbing workbox changes no currently-working
      behavior.
  - The stub itself throws a clear, intentional error (not a cryptic "is not a constructor") if
    either path is ever actually reached in a bundled build, naming the excluded package and why.
    Gated on `!uiBundling` (threaded through `EsbuildOptions`/`bundle-cli.ts`/`build-sea.ts`) so
    `--ui-bundling` builds - which install the real UI dependency tree specifically to make this
    path work - are unaffected.
  - **Measured: 78.3 MB → 60.15 MB, an 18.7 MB drop** - more than the ~7 MB `webpack` estimate alone,
    since other webpack-plugin-ecosystem transitive deps (terser-webpack-plugin, webpack-manifest-
    plugin, etc.) went with it. Confirmed via `metafile.json`: `webpack`, `@rspack/dev-server`, and
    `workbox-webpack-plugin` all show **0 bytes / 0 files** in the rebuilt bundle.
  - Verified end to end: `bit --version`/`--help` fine; `npm run lint` 0 errors; re-ran
    `custom-env-operations.e2e.ts` "should be able to re-tag with no errors" (the same real
    build/tag flow used throughout today) - passes. Sanity-checked `bit start` (no `--dev`, no
    shipped local pre-bundle) still fails the same way it already did - `Cannot find module
'assert/'` from `webpack-fallbacks.ts` (one of the ~18 polyfills never marked external, unrelated
    to this change) - not a new failure mode, matches the "residual risk" already flagged in
    `externals.ts` and §17c's established "rebuild fallback is broken, ship pre-bundles instead"
    finding.
  - Externals count unaffected (still 11) - this was a pure inlined-code exclusion, no externals
    added or removed.
- **2026-08-18** — **produced a real local UI/preview pre-bundle for the first time** (every prior
  attempt was blocked or faked - the 2026-08-13 entry above used a planted fake artifact, and
  2026-08-16 above documented `bd build` as blocked entirely by the `WorkspaceAspectsLoader` hang).
  Two things changed since 2026-08-16 that made this possible:
  - The hang bug itself turned out to already be **fixed and merged onto this branch**
    (`14399df10`/`53c59529e`, 2026-08-17, from an unrelated upstream branch) - see
    `scripts/circular-deps-check/CI-HANG-INVESTIGATION.md`, marked **RESOLVED**. Its real cause was
    never an infinite recursion: this branch's dev-binary install pins the legacy core envs
    (`@teambit/node`, etc.) that `remove-core-envs-from-manifest` dropped from the core manifest, so
    a **bvm-installed** workspace was missing them, and requiring them as plain packages triggered
    `onAspectLoadFail`'s recompile-cascade (thousands of dist rewrites) instead of a clean error.
    Confirmed live: `node_modules/@teambit/node` in this workspace already resolves to a real pnpm
    package (the dev-binary install had already pinned it), and `bd build "teambit.ui-foundation/ui,
teambit.preview/preview" --reuse-capsules --tasks "BundleUI,PreBundlePreview"` completed cleanly in
    **~5 minutes**, no hang, using `bd` (this branch's own compiled code) throughout.
  - Tried the bvm-linked released `bit` (2.0.82) binary as a workaround **first**, before finding the
    above - it does not hang, but it is the **wrong tool for this**: `teambit.preview/preview` is a
    core aspect, so under a bvm-linked binary it resolves to the **bvm's own published package**
    (`~/.bvm/versions/2.0.82/bit-2.0.82/node_modules/@teambit/preview`), not this branch's modified
    source - confirmed directly from the stack trace (`buildPreBundlePreview
(...bvm/versions/2.0.82.../pre-bundle.js:176)`). Concretely: it ran the **pre-§17e** task logic (no
    `filterCoreAspectDefs`/`forPreBundle`), and separately failed outright with `Module not found:
    '@teambit/react.ui.highlighter-provider'` from the bvm's own `@teambit/react` - an instance of
    the exact "mixed `@teambit/*` resolution" problem (§6) the whole bundling effort exists to avoid,
    not a real signal about this branch's code. **`bd`, not the bvm binary, is the only way to
    produce a pre-bundle whose content actually reflects this branch.**
  - The produced artifacts: `@teambit/preview` hash `e23f10dabd03a3d79a2f01794266b6e878104101` -
    **exact match** for §17b's predicted "5 core, no react" value, confirming `filterCoreAspectDefs`
    is doing the right thing on a real build, not just in the 2026-08-13 planted-artifact test. UI
    artifact 79 MB (workspace + scope), preview 704 KB - in the ballpark of §17g/§17h's prior
    measurements.
  - First pass copied both into `node_modules/@teambit/{ui,preview}/artifacts` **by hand** (`cp -R`
    from the capsule paths) before running `npm run bundle` - that worked
    (`shipped artifacts: 161 files (pre-built UI/preview bundles)`, first time that line has ever
    said anything but "none" locally) and verified `bit start` end to end against
    `/tmp/bundle-tests/start-ws` with the resulting `/tmp/bit-bundle`: `shouldServeBundleUi` logged
    `currentBundleUiHash == cachedBundleUiHash`, served from
    `.../core-aspects/node_modules/@teambit/ui/artifacts/ui-bundle/scope/public/bit`, HTTP 200, no
    `public/` written - the same signature as §17g's original (faked-then-real) success. **But the
    manual `cp -R` step was never encoded anywhere** - caught in review (correctly) as a gap: the
    first cut of `savePrebundleCache` read from `node_modules/@teambit/{ui,preview}/artifacts`, which
    `bit build` never writes to, so `save` silently depended on that hand-run copy having already
    happened.
  - **Fixed**: `savePrebundleCache` now locates the capsules itself via `bit capsule list --json`
    (`workspaceCapsulesRootDir` + the `capsules` path list, matched by capsule-dir basename prefix -
    `teambit.ui-foundation_ui@…` / `teambit.preview_preview@…`) and reads `artifacts/` straight out of
    them - no manual step, no intermediate `node_modules` copy. Takes a `bitBin` option / `BIT_BIN` env
    var (same convention as `scripts/circular-deps-check`) for **which** `bit` to run `capsule list`
    with, defaulting to `bit` on `PATH` - it must be the same binary the build itself ran with, since
    a bvm-linked released `bit` would list capsules for _its own_ `teambit.ui-foundation/ui`/
    `teambit.preview/preview`, not this workspace's (same core-aspect-resolution trap as above).
    Re-verified end to end with the fix: `rm -rf .bundle-cache node_modules/@teambit/{ui,preview}/artifacts`,
    `BIT_BIN=bd npm run bundle:prebundle-cache:save` (no manual copy), `npm run bundle` → restores
    from cache and reports the same `shipped artifacts: 161 files`.
  - **Added a repo-local cache so this does not have to be re-derived every time `node_modules` gets
    wiped**: `scopes/harmony/modules/cli-bundler/prebundle-cache.ts` (`savePrebundleCache` /
    `restorePrebundleCache`), storing a copy under `.bundle-cache/ui-preview-prebundle/` (gitignored)
    plus a `meta.json` recording the commit and timestamp the artifacts were captured at - so a later
    session can tell at a glance whether the cache is worth trusting without rebuilding to find out.
    `npm run bundle` (`scopes/harmony/bit/bundle/bundle.ts`) calls `restorePrebundleCache` first; it
    only fills in `node_modules/@teambit/{ui,preview}/artifacts` when they are **not already there** -
    a real local build always wins over the cache. New scripts: `bundle:prebundle-cache:save` /
    `:restore`. Deliberately just a file cache, not a freshness gate against source changes - "most
    of the time we don't really need to re-create them" per the ask, and the `meta.json` commit/date
    is there for a human to judge staleness, not for the script to enforce it.
  - **Verified `bit start` end to end against a real (not just faked-artifact) pre-bundle**, from a
    fresh `bit init` + `bit create react ui/button --aspect teambit.react/react-env` workspace,
    entirely through `/tmp/bit-bundle/bin/bit`: both `shouldServeBundleUi` (workspace _and_ scope
    roots) and `writePreviewEntry` matched hashes and served from the shipped `artifacts/`, HTTP 200,
    no `public/` written. The only rspack run observed was the _component's own env_
    (`teambit.react/react-env`) compiling `comp1`'s composition - a separate dependency tree
    (`@teambit/webpack.webpack-bundler`, resolved from the env's own capsule per the #10610
    decoupling), unrelated to bit's own bundle. Confirmed `@rspack/dev-server` is absent from
    `package.json`/`node_modules` and its stub was never invoked (`grep`'d `debug.log` for its throw
    message - zero hits).
  - **Measured current sizes** (`/tmp/bit-bundle`, this build): `bit.app.js` 60.15 MB; `dist/`
    (bundle + 106 shims + locators + the pre-bundle artifacts) 160 MB, of which the UI/preview
    artifacts are 82.7 MB (`ui-bundle/workspace` 18 MB, `ui-bundle/scope` 65 MB, `preview` 0.7 MB) -
    the other 105 shims together are ~3 MB; externals installed 97 MB. Total `/tmp/bit-bundle` 257 MB.
    Per-external breakdown (`du -sh node_modules/*`), largest first: **`@rspack` 42 MB** (bigger than
    `typescript` at 23 MB or `@pnpm` at 22 MB - by far the single biggest external), `node-gyp` 2.3 MB,
    `bufferutil`+`utf-8-validate` ~1 MB combined, everything else under 1 MB each including
    `postcss-flexbugs-fixes`+`postcss-normalize` (~96 KB combined, matching §17h's "~50 KB" estimate).
  - **Is `@rspack/core` still earning its 42 MB now that `bit start` serves the pre-bundle?** Traced
    every call site (`rspack(...)`, not just the import): `ui.main.runtime.ts:260,278` (`UiMain.build`
    - `BundleUiTask`), `ui-server.ts:328` (`UIServer.dev()` - `bit start --dev`),
      `preview/pre-bundle.ts:118` (`buildPreBundlePreview` - `PreBundlePreviewTask` and the
      hash-mismatch rebuild fallback). All four are inside functions, never called at module scope - so
      the _call_ only happens during an actual `bit build --tasks BundleUI,PreBundlePreview` (exactly
      what this session used to produce the cached pre-bundle) or the rebuild fallback (already broken
      in the default build without the rest of `UI_BUNDLING_EXTERNALS` - `postcss-loader`, `sass`, etc.,
      per §17c). The _import_, though, is eager (`import { rspack } from '@rspack/core'` at the top of
      `ui.main.runtime.ts`/`ui-server.ts`/`pre-bundle.ts`, all always-loaded since ui/preview are core
      aspects) - that is why it is external today rather than merely unresolved-and-ignored: esbuild
      can't inline a native `.node` addon, and nothing currently stubs it. Contrast with
      `@rspack/dev-server` (`stub-dev-only-plugin.ts`): that one _is_ stubbed, safely, because requiring
      the stub module never throws - only _constructing_ the exported class does (`new Proxy(...)`,
      throws on `new`), and its one real call site (`UIServer.dev()`) is never reached outside
      `--dev`. The same pattern would work for `@rspack/core` (`rspack(...)` is a plain call, not
      `new` - calling a stub class without `new` throws its own clear `TypeError` either way) **if** the
      product is willing to accept the same trade `@rspack/dev-server`/`workbox-webpack-plugin` already
      made: `bit build --tasks BundleUI,PreBundlePreview` and the hash-mismatch rebuild fallback would
      fail loudly from _the bundled distribution itself_ instead of working. Not done here - this is a
      real, unexplored ~42 MB lever (the single biggest since `webpack` was dropped, §14 2026-08-16),
      but a genuine behavior-changing decision, not a clean-up.
  - **`postcss-flexbugs-fixes`/`postcss-normalize`** (~96 KB): unrelated to whether `bit start` serves
    the pre-bundle - they're `require.resolve()`'d unconditionally at module scope in `postcss.config.ts`,
    imported by `rspack.browser.config.ts`, imported by `ui.main.runtime.ts` - i.e. paid on _every_ bit
    command that loads the UI aspect, bundling or not. Already a known, deferred lever, not new: §17h
    names the exact fix ("making `postCssConfig` a function would drop two more externals"). Tiny
    (~96 KB), so low priority next to `@rspack/core`.
  - **`bufferutil`/`utf-8-validate`** (~1 MB combined): **nothing to do with UI/preview bundling at
    all** - confirmed they are `ws`'s own optional peer deps (`node_modules/ws/package.json`
    `peerDependenciesMeta.{bufferutil,utf-8-validate}.optional: true`), native accelerators for
    WebSocket frame masking/UTF-8 validation that `ws` falls back to a pure-JS implementation without.
    Bit's own `ws` consumer is `create-remote-schemas.ts` (GraphQL remote-schema stitching), not
    anything UI/preview-related. Since `ws` already treats them as optional, they may be droppable
    entirely (joining `pnpapi`/`fsevents` in `externalsNotInstalled` rather than being real installed
    packages) - not verified this session, small (~1 MB), not investigated further.
  - **Fixed the one item above with no behavior tradeoff**: `bundle-cli.ts` wrote esbuild's
    `metafile.json` (build-analysis JSON - module graph, sizes, imports) unconditionally into
    `paths.bundleDir`. For `inPlace: true` builds - the real `BundleCliAppTask` path, where the out
    dir _is_ the capsule that becomes the published `@teambit/bit` package (§9b) - that shipped **8.9
    MB of pure diagnostic output to every user for zero runtime benefit**: confirmed nothing reads
    `metafile.json` back at runtime (`result.metafile` is used in-memory for `generateEsmBridges`
    during the build itself; only `bundle-cli.ts`'s write and CI's `store_artifacts` step touch the
    file). Gated the write on `!options.inPlace`, so it's still produced for local `npm run bundle`
    iteration and CI's `setup_esbuild_bundle` diagnostic capture (both non-`inPlace`), just not for
    the shape that actually ships. Verified both branches directly: a scratch `bundleCli({..., inPlace:
true})` run produced no `metafile.json` (`dist` 153 MB vs 160 MB with it); a plain `npm run bundle`
    still writes it.
  - **Corrected size totals** (`/tmp/bit-bundle`, after the metafile fix): shipped `dist/` 153 MB /
    1,084 files (was 160 MB / including `metafile.json`), externals unchanged at 97 MB / 1,492 files.
    **Total shipped distribution: 250 MB / 2,576 files** (was 257 MB measured earlier this session,
    322 MB in the original 2026-08-16 estimate before this branch's later externals cuts). Updated
    `bundle-plan.md`'s "at a glance" table and PR #10590's description to match.
- **2026-08-19** — **implemented Option A from the `@rspack/core` design discussion**: moved it out of
  the always-installed `NATIVE` group in `externals.ts` into `UI_BUNDLING_EXTERNALS`, and extended
  `stub-dev-only-plugin.ts` to stub it too, gated the same `!uiBundling` way as `@rspack/dev-server`/
  `workbox-webpack-plugin` (`run-esbuild.ts` already only includes the plugin at all when
  `!uiBundling`, so nothing there needed to change). One real gap closed in the stub itself: it was
  a `class` whose `constructor()` throws - correct for `new RspackDevServer(...)`/
  `new WorkboxWebpackPlugin.GenerateSW(...)`, but `@rspack/core`'s `rspack(...)` is called as a
  plain function, and calling a class without `new` throws a generic, unhelpful native `TypeError`
  instead of the friendly message. Changed the stub to a plain `function BitBundleStub() { throw ... }`
  instead of a class - a function throws the same message whether called or constructed, covering
  every excluded package's real call shape with one implementation.
  - **Verified end to end**: `npm run bundle` - 0 esbuild errors, `externalsInstalled: 10` (was 11).
    Rebuilt `/tmp/bit-bundle`, ran `npm install`: `@rspack` is completely absent from `node_modules`
    (was 42 MB, the single biggest external - `typescript` at 23 MB is now the largest). `bit --version`/
    `--help` fine. Re-ran the full `bit start` verification from §14 2026-08-18 (fresh workspace, real
    component, `/tmp/bit-bundle/bin/bit start`): UI shell HTTP 200, composition page HTTP 200,
    `shouldServeBundleUi`/`writePreviewEntry` both still hash-match and serve from the pre-bundle -
    unaffected, exactly as expected, since the default `bit start` path never reaches the now-stubbed
    call sites.
  - **Corrected sizes**: shipped `dist/` unchanged at 153 MB/1,084 files (this change only touches
    installed externals, not the JS bundle or shims - `@rspack/core` was already excluded from
    `bit.app.js` itself either way, esbuild can't inline a native addon). Externals: 97 MB → **63 MB**
    (a measured 34 MB drop - somewhat under the earlier 42 MB estimate, likely rounding/block-size
    noise in `du`, not a discrepancy worth chasing). **Total shipped distribution: 250 MB → 216 MB**
    (2,576 → 2,933 files - the file count actually rose slightly, since dropping `@rspack` also drops
    a version-resolution constraint that let a couple of other externals dedupe differently; not
    investigated further, the size drop is what matters). Updated `bundle-plan.md`'s "at a glance"
    table and PR #10590 to match.
  - **Measured whether Option B (lazy-loading the real `@rspack/core` import) is worth doing too**, as
    asked, "even in a hacky way": direct `require()` timing, 5 runs each, this machine -
    `require('@rspack/core')` (the real native addon, as it still is in a `--ui-bundling` build):
    **~19-21 ms** per call, consistently. `require()` of the generated stub module (what the _default_
    build now loads instead, post-Option-A): **~0.2-0.27 ms**. Conclusion: **Option A already captures
    essentially all of Option B's startup benefit for the default build** - the eager top-level import
    in `ui.main.runtime.ts`/`ui-server.ts`/`preview/pre-bundle.ts` now resolves to the near-free stub,
    not the real package, regardless of whether the import itself is eager or lazy. Option B would only
    still matter for **`--ui-bundling` builds**, where `@rspack/core` stays real and that same eager
    import costs ~20 ms on literally every command (`status`, `list`, `--help`, ...) even though
    `rspack(...)` is actually called on almost none of them. Against a ~0.5-0.7 s warm command budget,
    that is a real but modest ~3-4%, for an already-niche, opt-in audience. **Recommendation: low
    priority, not worth doing now** - defer until/unless `--ui-bundling` startup time specifically
    becomes a complaint; revisit this entry if it does.
- **2026-08-18** — **root-caused and fixed the `bit_pr` step-119 crash** (pipeline `49772`, the
  Aug-16 run): the third §11D-class trigger, but a distinct _mechanism_ the two `CompilationInitiator`
  fixes could not cover. The job's `debug.log` artifact shows the fixed fallback firing
  (`getInstallCompilationInitiator: falling back to no initiator`) followed by dozens of "unable to
  resolve the core aspect X … unable to find X in node*modules/@teambit/X/dist" - the dev-binary
  install re-imports every injected workspace package (its manifest still differs from the released
  binary's, which filters the legacy core envs), and the re-import recreates each package dir from
  the component \_source* dir, which holds no `dist/` - so the compiled output of every
  workspace-authored core aspect, `@teambit/bit` included, is wiped in place. The existing
  preservers (`preserve-loaded-virtual-store-dirs.ts`, `preserve-loaded-nested-pkg-dirs.ts`) only
  cover _removed_ directories; here the package dir survives, so they see nothing missing, and no
  donor copy of the dist exists anywhere (the node_modules copy was the only one). The crash then
  lands on the first deferred require in bit's own already-loaded code - this run:
  `legacy.consumer-component` deferring `require('./exceptions/main-file-removed')` while loading
  `teambit.harmony/envs/bit-cli-app-env` for the trailing compile, escaping as a fresh
  `@teambit/legacy.constants` resolution, then buried under the known `handle-errors.ts`
  double-failure (`@teambit/legacy.loader` gone too, stack cut at node's 10-frame default).
  **Fix**: new `preserve-loaded-component-dist-dirs.ts` in the pnpm aspect - before the engine
  runs, hard-link-clone the `dist/` of every loaded `_bit_local` package under the workspace's
  node_modules (links pin the inodes, no data copies; skipped for lockfile-only/dry-run installs);
  after it, move back any dist the install dropped, then remove the clone root. Restored files are
  exactly what the in-memory modules were loaded from, and the trailing `compileOnWorkspace`
  rewrites them fresh anyway. This also explains and fixes the "bit install post-merge needed two
  passes" symptom (§ 2026-08-16 above) - the first pass was dying in this window. Verified by a
  standalone driver exercising snapshot/wipe/restore, symlink-guard, virtual-store/non-local
  exclusion, and stale-clone-root reclaim (all pass; spec file added mirroring
  `preserve-loaded-nested-pkg-dirs.spec.ts`); `tsc --noEmit` error set unchanged vs. the branch
  baseline and oxlint clean on the touched files. The e2e-bundle failures on the same pipeline are
  both previously-triaged items (mdx-v3-options pre-bundle gap ×2, `bit --help` timing budget), not
  new regressions.

- **2026-08-19** — **the preserve-dists fix worked**: the first CI run carrying it (pipeline `50133`)
  got `bit_pr` past step 119 for the first time on this branch - the dev-binary install completed,
  `bit ci pr` ran a real build and cleared 44/87 tasks. It then failed at task 45
  (`core-aspect-env` → `BundleUI` for `teambit.scope/scope`) with `updateWithCurrentPackageJsonData
found duplicate capsules: teambit.harmony/envs/bit-cli-app-env@9904eb…`. The job's debug.log
  shows the cause: the seeder list `ScopeAspectsLoader.resolveUserAspects` hands to
  `isolateComponents` contains `teambit.harmony/envs/bit-cli-app-env` **twice** - once versionless
  (the aspect-loader registered it from the workspace, where the env lives as a workspace
  component) and once with the snap hash minted by this very `bit ci pr` run (re-registered after
  the lane snap). `host.getMany` resolves both to the same snap, producing two capsules with equal
  ids. Only this branch hits it because `bit-cli-app-env` is the only _workspace-component_ env
  configured on anything - every other env in the build is an external published package. **Fix**:
  `isolateComponents` now dedupes `componentsToIsolate` by full component id right after resolution
  (and `seedersWithVersions` after the versionless→resolved mapping, so `seedersCapsules` doesn't
  double up either). `tsc --noEmit` unchanged vs. baseline, oxlint/prettier clean.

- **2026-08-19** — **the dedup fix worked** (pipeline `50138`: "ensuring 14 capsule(s)", was 15, no
  duplicate-capsules error); `bit_pr` then failed one step further in the same `BundleUI` task:
  `ERR_PNPM_FETCH_404` for `@teambit/harmony.modules.cli-bundler` - the aspect-capsule install for
  `bit-cli-app-env@<snap>` lists its dependency `cli-bundler` at the version snapped by this very
  run, and the registry has neither the name (first-ever snap of a new component) nor lane-only
  versions in general (`mcp-config-writer`'s branch snap would 404 next). The isolator already
  handles exactly this for _cyclic_ snap deps ("an unpublished snap genuinely can't be fetched" -
  pulled in as capsules and grouped so the members install together at the shared root with
  sibling links); a plain dependency edge to an unpublished snap had no such handling because no
  prior branch ever had a workspace-component env with workspace-component deps. **Fix**: new
  `IsolatorMain.getSnapDependenciesOfSeeders` - for aspect isolation, every snap-versioned,
  non-core dependency reachable from a seeder (graph `successors`, transitive) is pulled into the
  isolation and grouped with that seeder via the existing install-together mechanism. Core aspects
  are excluded even when snap-versioned (the capsules root links them). Only seeders that reach a
  snap dep group; external published envs keep their isolated nested installs. tsc baseline
  unchanged, oxlint/prettier clean.

- **2026-08-19** — **`bit_pr` is green** (pipeline `50144`, job `444108`) - the first passing
  "bit ci pr" on this branch, ever. The three fixes verified in sequence across pipelines
  `50133`/`50138`/`50144`: (1) `preserve-loaded-component-dist-dirs` got the dev-binary install
  through the reinjection dist-wipe; (2) the isolator seeder dedup removed the duplicate
  `bit-cli-app-env` capsule; (3) `getSnapDependenciesOfSeeders` let the aspect-capsule install
  resolve the env's unpublished snap deps (`cli-bundler` et al.) as grouped sibling capsules
  instead of registry fetches. Remaining red on the workflow, both pre-existing and unrelated to
  these fixes: `check_circular_dependencies` (failing since the Aug-18 pushes, before these
  changes - its own `bit install` step dies with a "killed" signal, i.e. OOM on its smaller
  container, after missing-dist warnings under `.pnpm/<file+…>` slots - note that layout is a
  _fourth_ dist-wipe variant, inside virtual-store slots of injected components, which
  `preserve-loaded-component-dist-dirs` deliberately does not cover; worth a follow-up if that job
  stays red after the OOM is addressed), and the known `e2e_test_esbuild_bundle` triaged set.

- **2026-08-19** — merged `origin/remove-core-envs-from-manifest` into `bit-bundle3`
  (`381bdf0f0`). Upstream landed `9f3e39ee9` ("bundle both ui roots in one compilation, 24MB to
  16MB") and `3f8ee8d58` between this branch's previous merge of that base and now, replacing
  `BundleUiTask`/`UiMain.build`'s per-root two-compilation approach (the one added here across
  `959e8ee89`/`6f682431d`/`460464ce4` to fix an OOM from two live rspack module graphs) with a
  single rspack compilation carrying one entry per UI root, so shared chunks are emitted once
  instead of duplicated - a stronger fix for the same OOM, and it obsoleted `deferClose`/
  `openBuildCompilers`/`closeBuildCompilers`, which are gone. Reconciled by hand: kept upstream's
  single-compilation architecture and its `.hash` layout (one JSON file at
  `artifacts/ui-bundle/`, keyed by root aspect id, instead of a `.hash` per root directory), but
  ported this branch's `forPreBundle` flag onto it (`UiMain.build`'s `options.forPreBundle` now
  filters every entry's aspects through `filterCoreAspectDefs` via `resolveUiAspects`, and
  `BundleUiTask` passes `{ forPreBundle: true }` and hashes with `createBundleUiHash(uiRoot, 'ui',
true)` so the artifact and its hash agree - see §17d/17e). Also kept this branch's
  `getBundleUiPath` fix (`getAspectArtifactDir`, tries the running bit's own artifacts before
  bvm) rather than upstream's reverted-to `getAspectDirFromBvm`, adapted to the new single
  no-arg artifact directory. `npm run lint` (tsc + oxlint) clean after reconciliation.

- **2026-08-19** — cherry-picked `59bd5c2ce` (#10631, "bit start sanity e2e, plus fixes for the
  qodo findings on #10628/#10629") onto `bit-bundle3` (`664cbb1ea`) — landed on `master` after this
  branch's merge above, so it wasn't pulled in with it. Reconciled the same `bundle-ui.task.ts`
  conflict as above (kept `getUiRoots()`-based hashing from #10631 - hash exactly the _registered_
  roots instead of a hardcoded list - combined with this branch's `forPreBundle: true`), and merged
  `http-helper.ts`'s new `HttpHelperOptions`/`stderr`/timeout machinery with this branch's
  `serverBin` (folded `serverBin` into the options object). Added `e2e/harmony/ui-start.e2e.ts`.
  `npm run lint` clean.
- **2026-08-19** — the two new suites (`ui-ssr.e2e.ts`, `ui-start.e2e.ts`) default to `--rebuild`
  against `nonBundledBitBin`/no explicit binary, which breaks under `e2e_test_esbuild_bundle` (its
  default bundle ships no rspack to rebuild with) and doesn't exercise the real shipped pre-bundle
  either way. Gated both behind `BIT_E2E_UI_MODE` (`rebuild` | `prebuilt`, see `uiE2eMode()` in
  `e2e/http-helper.ts`) so they skip unless explicitly requested, and documented the two run modes
  plus exact commands in [11-e2e-suite.md](11-e2e-suite.md). Neither mode is wired into CI yet -
  tracked as gap 9 in [14-known-gaps.md](14-known-gaps.md).
- **2026-08-19** — smoke-testing `ui-ssr.e2e.ts` in `rebuild` mode (`BIT_E2E_UI_MODE=rebuild npx
mocha --require ./babel-register e2e/harmony/ui-ssr.e2e.ts`, against this branch's own `bd`)
  surfaced a real, deterministic (reproduced twice) SSR crash - **not** something introduced by the
  merge/cherry-pick above, since it's the first test to ever exercise `bit start`'s SSR path on this
  branch. `[ssr] failed at '/'`: `ReferenceError: window is not defined` inside `useUserAgent` (via
  `useIsMobile` → `Tooltip`) - the exact symptom #10628's `resolveAlias` fix
  (`rspack.common.ts`) targeted (a duplicated `use-user-agent` copy gives the SSR-context provider
  and consumer different module instances, so the consumer sees `undefined` and takes the
  browser-only fallback). The alias is present and applied on both the browser and SSR configs
  (verified), so it isn't simply missing. Likely cause: `node_modules/.pnpm` on this branch carries
  **three** React majors/minors side by side (19.2.7, 19.1.0, 18.3.1) - `workspace.jsonc`'s
  `overrides` comment confirms this is deliberate ("unify all React-19 contexts on a single exact
  version... v17(react 17) contexts are unaffected"), i.e. legacy, no-longer-core envs are
  intentionally left on an older React. `resolveAlias` pins one `react`/`react-dom`/`use-user-agent`
  copy globally, which doesn't obviously reconcile with a workspace that deliberately keeps two
  React majors live. Not root-caused further or fixed this session (a genuine fix needs to either
  extend the alias strategy or address why multiple React majors reach the SSR bundle at all -
  itself plausibly fallout from `remove-core-envs-from-manifest`, the same category of issue as
  §17b's hash mismatch). Tracked as gap 10 in [14-known-gaps.md](14-known-gaps.md) rather than fixed
  here, per explicit direction to prioritize the cache rebuild + size-doc update this session.
- **2026-08-19** — rebuilt the UI/preview pre-bundle from current source and refreshed
  `.bundle-cache/`: `bd build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules
--tasks "BundleUI,PreBundlePreview"` (§17i), then `BIT_BIN=bd npm run bundle:prebundle-cache:save`.
  UI artifact **16 MB / 57 files** (was 158 files / part of an 80 MB cache before #10629's
  single-compilation dedupe landed on this branch), preview unchanged at 704 KB / 3 files -
  `.bundle-cache/` itself: **80 MB → 19 MB**. Matches #10629's claimed 24→16 MB exactly.
- **2026-08-19** — while validating `prebuilt` mode end to end (`npm run bundle` with the fresh
  cache, then the two suites against the built binary), found and fixed a **real, independent bug**
  in `HttpHelper.start()` (`e2e/http-helper.ts`) - this is what the `prebuilt`-mode hang reported
  earlier in this entry's own investigation turned out to be, once isolated with a minimal repro
  script outside mocha: `childProcess.spawn(this.serverBin, args, { cwd })` does not go through a
  shell, so when `serverBin` is a full command string rather than a bare bin name - exactly what
  `CommandHelper.bitBin` legitimately is for a bundle under test, e.g. `"node
/tmp/bit-bundle/bin/bit"` - `spawn` looks for a single executable literally named that whole
  string (embedded space and all) and fails with `ENOENT`. Worse, that failure surfaces as an
  _unhandled_ `'error'` event (no listener was attached), which node throws from deep inside its own
  internals rather than rejecting the `start()` promise - so neither `resolve` nor `reject` ever
  fires, and a `before()` hook with `this.timeout(0)` (both new suites use it, since a `--rebuild`
  run legitimately takes minutes) just hangs forever with no error printed anywhere. Fixed by
  splitting `serverBin` into `[program, ...programArgs]` before spawning, and by adding an `'error'`
  listener that rejects cleanly. This bug is unrelated to anything else in this session - `rebuild`
  mode never hit it because `nonBundledBitBin`/a plain bin name never contains a space - and would
  have affected _any_ future caller passing a multi-word `serverBin`, not just `prebuilt` mode.
- **2026-08-19** — with that fix, `prebuilt` mode is fully verified against a real `npm run bundle`
  build (fresh externals install, `bit --version`/`--help` both fine, 16 MB UI + 704 KB preview
  correctly present under `dist/core-aspects/node_modules/@teambit/{ui,preview}/artifacts/`):
  `BIT_E2E_UI_MODE=prebuilt` + `ui-start.e2e.ts`/`ui-ssr.e2e.ts` together - **16/16 passing**,
  including all 4 SSR assertions. That is the important correction to the SSR-crash entry above:
  the crash is confined to `rebuild` mode (a live rebuild resolving the _full_ test workspace's
  aspect graph, which can pull in a non-core env like `teambit.react/react` and, with it, a second
  React major) - the shipped, `forPreBundle`-filtered (core-aspects-only) artifact that
  `BundleUiTask` actually produces and ships does **not** hit it, confirmed by all 4 SSR checks
  passing against the real bundle. So the SSR bug affects local `--rebuild` dev workflows only, not
  what real users get from a released bundle - downgraded in known-gaps accordingly, though it's
  still worth fixing since `--rebuild` is the documented fast local-iteration path (§17i).
- **2026-08-19** — total esbuild CLI bundle size with the fresh pre-bundle: **160 MB / 2,839 files**
  (`bundleSizeMb` 60.18 from `npm run bundle`'s own report + 100 MB of externals after `npm
install`), down from the previously recorded 216 MB / 2,933 files - the ~60 MB UI-bundle shrink
  from #10629 flows straight through. See PRs #10628 (58→24 MB, SSR fix), #10629 (24→16 MB, single
  compilation), #10631 (bit-start sanity e2e + qodo-finding fixes, cherry-picked above) for the
  upstream work behind these numbers.
- **2026-08-19** — cherry-picked `5a2cf77e4` (#10634, "provide the ssr browser context above
  ClientContext") onto `bit-bundle3` - opened directly off the SSR-crash finding logged above.
  `SSRBrowserProvider` now wraps `ClientContext` instead of being nested inside it, so anything
  `ClientContext` itself renders (icons, theme switcher, loader ribbon, tooltip mount point) sees
  the ssr-browser context; before this, only `{hudItems}`/`{routes}` did. Clean cherry-pick, no
  conflicts, `npm run lint` clean.
- **2026-08-19** — re-ran `ui-ssr.e2e.ts` in `rebuild` mode after the #10634 cherry-pick and
  recompiling: **identical failure**, byte-for-byte the same stack trace
  (`useUserAgent → useIsMobile → Tooltip`, `ReferenceError: window is not defined`). #10634 does
  not close this branch's gap - per its own PR description's "residual gap" section, it only
  covers components rendered inside the JSX `ClientContext` passes down; render-plugin
  `reactContext`s (pubsub, lanes, notifications, **user-agent** itself) are applied by
  `ServerRenderer` outside that tree and remain unprovided either way. This also invalidates the
  earlier "three React majors" hypothesis in this log as the actual cause - #10634's fix is a pure
  JSX-nesting change with nothing to do with React version duplication, and it measurably fixed a
  real, verified case (its own "Proof" table, 2 failing → 4 passing) without touching this branch's
  failure at all. The real cause is almost certainly the same tree-position gap #10634 names as
  residual: whatever renders `Tooltip` in this branch's scope-UI SSR path does so through a
  render-plugin context, not through `ClientContext`'s children. Not investigated further this
  session - updated [14-known-gaps.md](14-known-gaps.md) gap 10 accordingly rather than chase it,
  per the session's priority (PR description sizes, #10634, CI wiring).
- **2026-08-19** — reworked the CI wiring: the first version put the pre-bundle build inside
  `setup_esbuild_bundle` itself, ahead of the esbuild build, which would have delayed all 40
  parallel nodes of `e2e_test_esbuild_bundle` behind a real `bit build` just to serve two spec
  files. Split into two new jobs instead - `build_ui_prebundle` (parallel to `setup_esbuild_bundle`,
  both requiring only `setup_harmony`: dev-binary install + `bit build ... --tasks
BundleUI,PreBundlePreview` + `bundle:prebundle-cache:save`, persists `.bundle-cache/`) and
  `e2e_test_ui_prebundle` (requires both `setup_esbuild_bundle` and `build_ui_prebundle`: copies
  the fresh pre-bundle directly into the already-built bundle's output - a plain file copy, no
  rebuild needed - then runs `BIT_E2E_UI_MODE=prebuilt` against just the two UI spec files). Neither
  new job is in `e2e_test_esbuild_bundle`'s dependency chain, so a slow or failing pre-bundle build
  delays or fails only its own narrower job.
- **2026-08-19** — also removed the `only: /^bit-bundle.*/` branch filter from all four
  esbuild-bundle jobs (`setup_esbuild_bundle`, `e2e_test_esbuild_bundle`, and the two new ones). It
  predated this session - `setup_esbuild_bundle`'s own comment called it "gated to the bundling
  branches until it is proven green" - but left as-is it would have stopped this entire CI signal
  from running anywhere the moment this branch merged to `master`, since `master` never matches
  that pattern. Now runs on every branch; the tradeoff is real added CI cost (an esbuild bundle
  build + its 40-way e2e sweep + the two new jobs) on every PR going forward, not just
  `bit-bundle*` ones - accepted deliberately, not a default worth revisiting without reason.

- **2026-08-19** — **`check_circular_dependencies` root-caused** (pipeline `50233`, its own step-115
  `bit install`, failing since the Aug-18 pushes): the same reinjection dist-wipe, in the two copy
  locations the first preserver deliberately didn't cover - packages the process never loaded
  (`toolbox.modules.module-resolver` at the root, so aspect resolution of the legacy envs fails)
  and the injected `.pnpm/<pkg>@file+…` virtual-store slots plus `.bit_roots` copies (so dependency
  symlinks of _other_ slots resolve into dist-less copies, e.g. `config-store` through
  `legacy.constants`' slot). Those load errors are caught, but they mark the envs failed-to-load,
  which sends the install into the recompile cascade the job's own config comment documents as its
  historical hang cause - and on this job's `medium` container that path ends in "Received killed
  signal" (OOM). **Fix**: rewrote the preserver as `preserve-component-dist-dirs.ts` - the "loaded"
  heuristic is gone; the package set now comes from the install's own project manifests (a fresh
  load breaks on a wiped dist just as hard as a deferred require), one dist clone per package
  serves every copy, and the restore re-discovers all current copy locations (root, `file+` slots
  including ones the install re-keyed, `.bit_roots`) and re-links dist into any that lost it.
  Skipped for capsule installs (dists are written after the install there) and lockfile-only/
  dry-run. Measured on bit's own workspace: ~1.8s snapshot + ~2.5s no-op-restore/cleanup on a mac
  (332 dist-bearing packages, 921 slots) - noise against a minutes-long install. 10-scenario
  driver passes; tsc error set unchanged vs. the post-merge baseline; oxlint/prettier clean.
  Residual risk: if the job still dies after envs load cleanly, the remaining lever is job config
  (RAYON cap / package cache / resource class, all of which `bit_pr` has and this job lacks).
- **2026-08-19** — verified whether the core preview pre-bundle fixes
  `custom-env-operations-2.e2e.ts`'s "an env with a preview/bundler but without a compiler" ▸ "bit
  build should not fail generating the preview" (a real `e2e_test_esbuild_bundle` failure reported
  from CI: `Cannot find module '@teambit/mdx.modules.mdx-v3-options'`, thrown building a
  workspace-local custom env's preview) - by building two real, current-source esbuild bundles side
  by side, one with `node_modules/@teambit/{ui,preview}/artifacts` populated (from `.bundle-cache/`)
  before bundling and one with both that cache and those directories moved aside first (`bundleCli`
  reported `artifactFiles: 0`, confirming a genuinely pre-bundle-free build), then running the exact
  failing `describe` block (temporarily `.only`-ed) against each via `--bit_bin`. **Without the
  pre-bundle: reproduced exactly** (same `Cannot find module` error, same stack). **With it: both
  assertions pass** (`build succeeded`, `GeneratePreview` ran - 37s, no failures). This is gap 1's
  documented "remaining limitation" ("a workspace whose env contributes its own preview-runtime
  aspects misses the `.hash` and falls into the rebuild path") showing up as a concrete, reproducible
  test failure rather than a theoretical one - and confirms `EnvPreviewTemplateTask` needs the _core_
  preview pre-bundle as a foundation even when the failing env itself is workspace-local, not core.
  Practical implication: `build_ui_prebundle` (this session, §14 above) produces exactly the artifact
  that fixes this, but `e2e_test_esbuild_bundle` - the main, un-split sweep this test actually runs
  in - doesn't consume it (only the new, narrower `e2e_test_ui_prebundle` does). So this test, and
  plausibly others shaped like it (any custom/non-core env exercising `GeneratePreview` under the
  bundle), stay red in the main CI sweep until that's addressed - tracked as gap 11 in
  [14-known-gaps.md](14-known-gaps.md) rather than fixed here, since doing so reopens the exact
  "don't delay the 40-way sweep" tension `build_ui_prebundle` was split out to avoid, and resolving
  that tradeoff needs a decision, not just code.

- **2026-08-19** — **preserver v2 regression found and fixed via pipeline `50241`'s debug.log**
  (three jobs failed at their "bit install (dev binary)" step - `bit_pr` regressed from green). The
  log proves v2 ran and worked for rewritten copies ("cloned the dist of 326 component package(s) in
  201ms", "restored 945 component dist cop(ies) in 902ms") - but this install (post lockfile-regen
  `69833b80c`) **removes the root component dirs outright** instead of rewriting them
  (`preserve-loaded-nested-pkg-dirs` logged dozens of "removed by the install and no donor"), and
  bit's own node-modules-linker recreates them dist-less right after ("linking component to
  node_modules" at +20ms). v2's restore deliberately skipped missing dirs - v1 had, accidentally,
  created the dist into the missing root dir (fs.move creates parents), which is why `bit_pr` was
  green on v1 and red on v2. **Fix**: the root copy is now explicitly `createIfMissing` - its dist
  is pre-created from the clone for the linker to fill around (safe: the package is in this very
  install's manifests, so the linker is guaranteed to run; the linker only deletes an existing
  root when it's a symlink). Slot/.bit_roots copies keep the existing-dir rule. Also merged
  `origin/master` (per request): conflicts resolved keeping the branch's newer sides (the shared
  #10631 content plus its branch-only follow-ups, `forPreBundle`, CI sampler scripts, dev-binary
  lockfile) and grafting master's `--skip-tasks PublishComponents` into the branch's `bit ci pr`
  command - note that flag makes the snap-deps isolator fix (`getSnapDependenciesOfSeeders`) fully
  load-bearing, since PR builds no longer publish any snap to npm.
