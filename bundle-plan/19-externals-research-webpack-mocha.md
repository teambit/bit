# 15. Externals research: can webpack or mocha be dropped from core? (2026-08-10)

[← back to bundle-plan index](../bundle-plan.md)

Prompted by: "why do we need both webpack and rspack — does `bit start` use only rspack now? could we
remove the webpack aspect?" and "do we really use the mocha aspect/tester here — can it go?" Both were
investigated read-only (no code changed this session); see agent reports in this session's transcript
for full file-by-file detail. Summary below is what's actionable.

### 15a. Webpack vs rspack

**Not 100% rspack yet.** `bit start`, the UI dev server, `bit-cli-app-env` and `cli-bundler` are fully
rspack (`scopes/ui-foundation/ui/ui-server.ts:12-14,328-329`, `scopes/preview/preview/rspack/`) and
`@teambit/react.react-env@2.0.3`'s `preview()` calls `@teambit/rspack.dev-services.preview.react-preview`
exclusively — no webpack dependency in its `package.json`. **But** two other real, shipped envs still
route through the webpack-based `@teambit/preview.react-preview`:

- `@teambit/mdx.mdx-env@3.1.1` — used by components tracked in _this_ monorepo (e.g. under
  `scopes/compilation/aspect-docs/`, `scopes/pipelines/aspect-docs/`).
- `@teambit/node.node@4.0.1` — the Node app-type env.

`pnpm why @teambit/react.webpack.react-webpack` confirms `teambit.react/react-webpack`,
`teambit.preview/react-preview`, and `teambit.webpack/webpack-dev-server` (the three components named
in the original question) are **live, currently-published bit.cloud packages**, not orphaned —
`@teambit/preview.react-preview@1.1.13`'s `package.json` declares real (non-peer) deps on
`webpack: ^5.88.2`, `webpack-dev-server`, and `@teambit/react.webpack.react-webpack`.

`@teambit/webpack` (`scopes/webpack/webpack/webpack.main.runtime.ts:58-224`) implements the pluggable
`Bundler`/`DevServer` interfaces from `@teambit/bundler` (`scopes/compilation/bundler/`), the same
contract rspack implements via `Environment.getBundler?/getDevServer?`
(`scopes/envs/envs/environment.ts:163,175,245`) — so webpack and rspack are two interchangeable
providers behind one abstraction, not a hard dependency of the abstraction itself.

The reason it costs 14 MB unconditionally: `@teambit/webpack` is registered as a **core aspect** and
therefore an eager Harmony dependency of `BitMain` (`manifests.ts:44,160`; `bit.main.runtime.ts:9,23`),
so `WebpackMain.provider()` — which does `import webpack from 'webpack'` — runs on every `bit`
invocation, not lazily when a webpack-based env is actually built. `scopes/preview/cli/
webpack-events-listener/` is the only other in-repo wiring, and it's a pubsub listener that's
effectively orphaned now that react-env no longer emits those events.

**Superseded by §15d below** — a closer look found `mdx-env`/`node.node` never actually touch the
_local aspect_, only raw `webpack` via their own independent packages. Removing `@teambit/webpack`
from `manifests.ts` is safe for the CLI bundle with zero ecosystem impact; see §15d for the corrected
verdict and the one real caveat that survives (a phantom dependency in two published packages).

### 15b. Mocha aspect / tester

Two separate things, both under `@teambit/*`, easy to conflate:

1. **`@teambit/mocha`** (`scopes/defender/mocha/`) — a thin core-aspect wrapper whose only API is
   `MochaMain.createTester()` (`mocha.main.runtime.ts:12-19`). **Zero callers of `createTester()`
   anywhere in this repo.** It is registered in `manifests.ts:74,187`, making it — like webpack — an
   eager `BitMain` dependency loaded on every `bit` command.
2. **`@teambit/defender.mocha-tester`** — the actual `Tester` implementation (external package, not
   source in this repo), one of several pluggable implementations behind `@teambit/tester`'s abstract
   interface (`scopes/defender/tester/tester.aspect.ts`, `tester.service.ts:82-112`) alongside Jest/
   Vitest testers. **This one is genuinely in use**, and not just by hypothetical externals:
   - `cli-bundler` — this branch's own component — is configured with
     `teambit.node/envs/node-babel-mocha@2.0.4` as its env (`.bitmap:1088-1094`, set in `e441d0b60`,
     "cli-bundler is a plain node module rather than an aspect, so node-babel-mocha"). It has no specs
     yet, but the env is live.
   - `e2e/harmony/mocha-tester.e2e.ts` is a first-class suite asserting Bit's Mocha-tester support
     contract works end to end — this is a maintained feature, not incidental.
   - Published envs `@teambit/node.envs.node-babel-mocha@2.0.4` and
     `@teambit/node.envs.node-typescript-mocha@2.0.2` both import `MochaTester` directly from
     `@teambit/defender.mocha-tester`, bypassing the `@teambit/mocha` wrapper entirely — matching the
     pattern seen for webpack (real consumers go around the core-aspect wrapper, straight to the impl).

**Superseded by §15d below** — confirmed `@teambit/defender.mocha-tester` has zero dependency, declared
or phantom, on the local `@teambit/mocha` aspect (`pnpm why @teambit/mocha` resolves empty outside this
workspace's own dogfooding symlink), and `cli-bundler`/`node-babel-mocha` are structurally excluded
from the core-aspect enumeration that builds `bit.app.js`. The mocha case turns out cleaner than
webpack's: removing `@teambit/mocha` from `manifests.ts` is safe with **no caveats at all**.

### 15c. The common pattern, and the actual lever

Both webpack and mocha turn out to be about **eager core-aspect loading**. `manifests.ts` wires ~all
core aspects as unconditional `BitMain` dependencies (per D5/D6 in §13, deliberately untouched to avoid
runtime changes), so any aspect on that list pays its full `require()` cost on _every_ `bit` invocation,
whether or not the command needs it. That's the actual size lever, matching §8.2's existing item 1
(rspack/webpack optional) and item 2/3 (typescript/babel). §15d below sharpens this further: the
question "is the tool used" and "is the _local core-aspect wrapper_ used" turned out to have different
answers for both.

### 15d. Follow-up — separating "webpack/mocha the tool" from "the local core-aspect wrapper" (2026-08-10)

Re-investigated with a narrower question: does anything reach the _local_ `@teambit/webpack` /
`@teambit/mocha` aspect code specifically (aspect id, `WebpackMain`/`MochaMain` API, `manifests.ts`
registration), as opposed to just using the raw npm package or a separately-published bit.cloud
component that happens to share the name?

**Webpack — the local aspect is orphaned; one loose end.**

- `WebpackMain.createDevServer()` / `createBundler()` (`scopes/webpack/webpack/webpack.main.runtime.ts`)
  have **zero callers anywhere** — not in this repo, not in the compiled dist of `react-preview`,
  `react-webpack`, `webpack-bundler`, `webpack-dev-server`, `mdx-env`, or `node.node`.
- `scopes/webpack/module-federation/module-federation.main.runtime.ts:3,12,14-15` imports `WebpackAspect`
  and lists it in `static dependencies`, but the real `provider()` takes no arguments (the version that
  would inject `WebpackMain` is commented out) and `createMFBuildTask()` is an empty stub. This aspect
  also isn't registered in `manifests.ts` at all — dead code on top of dead code, unaffected by anything
  here.
- **One real, if narrow, edge**: the separately-published `@teambit/webpack.webpack-bundler` and
  `@teambit/webpack.webpack-dev-server` packages (used by `react-preview`, hence by `mdx-env`/
  `node.node`) do `require("@teambit/webpack")` for three plain utility exports, all re-exported from
  the aspect's `index.ts` alongside the Harmony-facing types — nothing about them is aspect/Harmony
  machinery:

  - `generateAddAliasesFromPeersTransformer(peers, logger)` (`scopes/webpack/webpack/transformers/
transformers.ts:8-34`) — a webpack-config transformer that resolves each peer dep (e.g. `react`)
    to its real on-disk path and `config.addAliases(...)`s it, so a previewed component shares the
    host's copy of the peer instead of bundling its own.
  - `generateExternalsTransformer(deps)` (`transformers.ts:56-62`) — a transformer that
    `config.addExternals(...)`s a dependency list so they're excluded from the component preview
    bundle. Both are consumed by `webpack-bundler`'s own `generateTransformers()`
    (`webpack-bundler/dist/transformers.js`), gated on `target.aliasHostDependencies` /
    `target.externalizeHostDependencies`.
  - `WebpackBitReporterPlugin` (`scopes/webpack/webpack/plugins/webpack-bit-reporter-plugin.ts`) — a
    plain webpack plugin class that taps `compiler.hooks.compile`/`done` and publishes
    `DevServerCompilationStartedEvent`/`DevServerCompilationDoneEvent` to Bit's pubsub (what drives
    `bit start`'s "compiling…" UI). Instantiated directly in `webpack-dev-server/dist/
webpack.dev.config.js:17,120`'s `plugins:` array.

  Neither `webpack-bundler` nor `webpack-dev-server` **declares** `@teambit/webpack` in its own
  `package.json` (`dependencies`/`peerDependencies` checked directly — absent in both; `webpack-dev-
server` only peer-deps on raw `webpack`) — it resolves only because this monorepo's tree happens to
  hoist it. So it's a real runtime dependency today, just an undeclared one, and the fix for a clean
  full deletion is either declaring it properly or inlining these three small, self-contained pieces
  into `webpack-bundler`/`webpack-dev-server` directly (none of them touch `WebpackMain` or Harmony).

- Net effect: **removing `@teambit/webpack` from `manifests.ts`** (stop it being an eager `BitMain`
  dependency) is unconditionally safe — `webpack`/`webpack-dev-server` drop out of `bit.app.js`'s
  externals immediately, and `mdx-env`/`node.node`/`react-preview` users are unaffected since they
  resolve `webpack` through their own declared `package.json` deps, never through the local aspect's
  Harmony wiring. **Deleting the aspect's source entirely** (and no longer publishing `@teambit/webpack`
  as an npm package) is a separate, slightly riskier step: `webpack-bundler`/`webpack-dev-server` would
  need their phantom dependency fixed first (either declare `@teambit/webpack` properly, or inline the
  three utility functions) — otherwise a future `webpack-bundler`/`webpack-dev-server` release could
  fail to resolve them. Already-published, already-pinned versions are unaffected (npm registry
  artifacts are immutable), so this isn't urgent, just a prerequisite for a clean full deletion.

**Mocha — fully orphaned, no loose ends.**

- `MochaMain.createTester()` (`scopes/defender/mocha/mocha.main.runtime.ts:12-19`) has zero callers
  anywhere, confirmed again including in the compiled dist of `node-babel-mocha`, `node-typescript-mocha`,
  and `@teambit/defender.mocha-tester` itself.
- `pnpm why @teambit/mocha` resolves **empty** — nothing in the dependency tree requires the local
  aspect as a package, not even implicitly. `@teambit/defender.mocha-tester`'s own `package.json` lists
  `mocha`, `@teambit/defender.tester-task`, `@teambit/compilation.babel-compiler`, etc. — no
  `@teambit/mocha`, declared or phantom. Unlike webpack, there is no loose end here.
- Raw `mocha` resolves via **two independent trees** (`pnpm why mocha`): `mocha@11.7.1` through
  `@teambit/defender.mocha-tester` (the component-testing pipeline), and a separate `mocha@11.1.0`
  declared directly in `workspace.jsonc:557-559` and used only by this repo's own e2e runner
  (`package.json` script `"e2e-test": "... mocha --require ./babel-register './e2e/**/*.e2e*.ts'"`).
  The two have nothing to do with each other; removing the mocha _aspect_ touches neither the e2e
  runner nor `@teambit/defender.mocha-tester`'s own dependency on raw mocha.
- `cli-bundler`'s `node-babel-mocha` env config (`.bitmap:1088-1094`) does **not** pull mocha into
  `bit.app.js` — confirmed structurally: `cli-bundler` and `node-babel-mocha` never appear in
  `manifests.ts` or `core-aspects-ids.json`, and `bundle-cli.ts` enumerates only core aspects from
  that list. cli-bundler's env only governs `bit test`/`bit build` run _on cli-bundler itself_
  (capsule-isolated), which is orthogonal to what ships inside the CLI bundle.
- Net effect: **removing `@teambit/mocha` from `manifests.ts` and deleting `scopes/defender/mocha`
  entirely is safe, full stop.** `mocha` drops out of `bit.app.js`'s externals; `node-babel-mocha`,
  `node-typescript-mocha`, `mocha-only-test-env`, and `cli-bundler` are all unaffected since none of
  them ever touched the local aspect; `@teambit/defender.mocha-tester` keeps working as a normal,
  non-core, opt-in dependency for whichever envs choose it.

**Bottom line**: mocha-aspect removal is a clean, no-caveat deletion. Webpack-aspect removal from the
core manifest (the thing that actually shrinks the bundle) is equally clean; only _deleting the source
and discontinuing the package_ needs the `webpack-bundler`/`webpack-dev-server` phantom-dependency fix
as a prerequisite.

### 15e. Mocha — resolved (2026-08-10)

Acted on §15d's verdict. Sequence, mirroring how the earlier install-guard fix landed
(§11D "Land the two install guards on `remove-core-envs-from-manifest`"):

1. **Removed the aspect on the base branch.** In the separate `dummy-bit` checkout (a full second
   clone of `teambit/bit`, kept on `remove-core-envs-from-manifest` precisely so branch work there
   never collides with this branch's in-flight state), pulled to `5f50bc2d5`, then:
   - `bit remove teambit.defender/mocha --silent` — untracked the component and deleted
     `scopes/defender/mocha/{esm.mjs,index.ts,mocha.aspect.ts,mocha.composition.tsx,mocha.docs.mdx,
mocha.main.runtime.ts}`, cleaned the `.bitmap` entry.
   - Dropped the two `manifests.ts` lines (`import { MochaAspect } from '@teambit/mocha'` and
     `[MochaAspect.id]: MochaAspect`) and the matching entry in
     `scopes/harmony/testing/load-aspect/core-aspects-ids.json` — the CI-mirrored core-aspect-id list
     flagged in §13/D5 as needing to stay in sync with `manifests.ts` by hand.
   - Repo-wide sweep confirmed zero remaining references to `@teambit/mocha`, `MochaAspect`, or
     `teambit.defender/mocha` outside one inert hit in the circular-deps-check baseline snapshot
     (`scripts/circular-deps-check/baseline-cycles-full.json`, a generated comparison artifact, not
     wiring — left alone, regenerable via `create-baseline.js` if it ever matters).
   - `npm run lint` (tsc --noEmit + oxlint): 0 errors.
   - Committed as `750f930c9` ("chore(defender): remove unused mocha core aspect") and pushed to
     `origin/remove-core-envs-from-manifest`.
2. **Merged into `bit-bundle3`** (`git merge origin/remove-core-envs-from-manifest`, commit
   `9158ab42a`). Clean, no conflicts — neither new commit touched `pnpm-lock.yaml`, and `5f50bc2d5`
   was already effectively present via the earlier cherry-pick (`7cb2d6d0a`). Found and removed one
   filesystem leftover the merge itself couldn't reach: a stale, gitignored
   `scopes/defender/mocha/node_modules/` (a prior local install's symlink farm) and a dangling
   `node_modules/@teambit/mocha` workspace symlink plus its orphaned `.pnpm` store entries — none
   tracked by git, all safe to delete outright.
3. **Removed `mocha` from `scopes/harmony/modules/cli-bundler/externals.ts`** (dropped from the
   `RUNTIME_PATH` group). Recompiling required the **released** `bit` binary (`~/.bvm/links/bit`,
   independent of this workspace), not the dev-linked `bd` — `bd` itself was transiently broken
   between the source edit and recompiling, since its own stale `dist/manifests.js` still required
   the now-deleted `@teambit/mocha`. A worthwhile general note for this kind of self-hosted change:
   when editing `manifests.ts` in this repo, expect `bd` to break until the next `bit compile`, and
   use the bvm-released `bit` (not `bd`) to perform that recompile.
4. **Validated against a full rebuild**: `npm run bundle` → `coreAspects: 105` (was 106),
   `externalsInstalled: 10` (was 11), 106 shims (unchanged — the aspect itself was never a shim).
   Grepped the emitted `bit.app.js` for `mocha`: zero `require("mocha")`/`require('mocha')` calls; the
   only two literal `"mocha"` string matches left are inert data — a `"test:cli": "mocha"` script name
   and a `"mocha": "2.2.x"` devDependency string, both embedded inside unrelated bundled package.json
   blobs (one is `gonzales-pe`'s own metadata). Confirmed `mocha` absent from the generated externals
   `package.json`, then rebuilt `/tmp/bit-bundle` clean and did `npm install` at the correct top-level
   directory (the newer §9b in-place shape — installing one level down, in `dist/core-aspects/bundle/`,
   is the old prototype path and errors with `ENOENT` looking for a parent `package.json`; doing so by
   mistake mid-session also clobbered the `dist/core-aspects/node_modules/@teambit/*` shims via an
   errant `npm prune` — recovered by deleting `/tmp/bit-bundle` and rebuilding from scratch, since it's
   disposable build output, not source). End-to-end smoke test from the resulting binary: `--version`,
   `--help`, `init`, `status` all pass in a scratch workspace.

**Status: done.** `@teambit/mocha` no longer exists in the source tree on `bit-bundle3`; `mocha` is
fully out of the CLI bundle and its externals. `@teambit/defender.mocha-tester` is untouched and keeps
working for `node-babel-mocha`/`node-typescript-mocha`/`cli-bundler`'s own env, exactly as §15d
predicted. Webpack (§15a/§15d) is unresolved and remains the next candidate — same shape, but blocked
on the `webpack-bundler`/`webpack-dev-server` phantom-dependency fix before a full source deletion
(de-registering it from `manifests.ts` alone, without deleting the source, does not have that blocker).
