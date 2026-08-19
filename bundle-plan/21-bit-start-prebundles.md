# 17. Making `bit start` work from the pre-bundles (2026-08-11)

[← back to bundle-plan index](../bundle-plan.md)

Prompted by: "let's try to make it work using the pre-bundle of the ui and preview code … it should
also suppose to remove most of the deps that are added as part of the ui-bundling flag."

### 17a. The two pre-bundles, and why neither was being used

`bit start` has two independent pre-built artifacts, both produced by `location: 'end'` build tasks
and both shipped inside a released bit:

|                 | produced by                                           | artifact                                                     | consumed by                                                      |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| UI shell        | `BundleUiTask` (`ui/bundle-ui.task.ts`)               | `@teambit/ui/artifacts/ui-bundle/{workspace,scope}/` (58 MB) | `UIServer.start({bundleUiRoot})` → `express.static`              |
| preview runtime | `PreBundlePreviewTask` (`preview/pre-bundle.task.ts`) | `@teambit/preview/artifacts/ui-bundle/` (0.9 MB)             | `writePreviewEntry` → a generated one-line entry that imports it |

Each is gated on a `.hash` file: sha1 of the **sorted ids of every aspect carrying that runtime**,
compared against the same list recomputed in the user's workspace. On a match, `bit start` runs **no
bundler at all** — that is the whole point, and it is why the `--ui-bundling` externals are not
needed at runtime (§8.3, §17d).

Measured on `/tmp/bundle-tests/start-ws` (one component, symphony env):

- **released bit 2.0.72**: HTTP 200 immediately, no `public/` written → both pre-bundles served.
- **this branch, `bd start`**: both hashes mismatch → falls back to the rspack builds, which fail.
- **this branch, bundled**: same, plus the 228-error rspack wall in §17c.

So `bit start` was broken on this branch **independently of bundling** — the bundle merely had no
way to reach a pre-bundle at all, because `getBundleUiPath`/`getBundlePath` resolved artifacts
**only** via `getAspectDirFromBvm`. A bundled bit has no bvm install of itself; on this machine it
silently read the artifacts of the _released_ 2.0.72 sitting in `~/.bvm`.

### 17b. Root cause of the hash mismatch — arithmetic, not guesswork

Every hash below was reproduced with `sha1(sortedIds.join(''))`:

| list                                                                            | hash                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `compositions, docs, command-bar, pubsub, preview` + `teambit.react/react`      | `11341fbe…` = **released 2.0.72's shipped `.hash`** |
| the same 5, **no react** — what a user workspace resolves on this branch        | `e23f10da…`                                         |
| the same 5 + `teambit.react/react@1.0.1042` — what this branch's build produced | `d3040e74…`                                         |

`remove-core-envs-from-manifest` dropped react from the core aspects. Under released bit react was a
core aspect, so _every_ workspace resolved it and bit's own build agreed with all of them. Now:

- a user workspace resolves 5 aspects;
- **bit's own repo still resolves react**, because some of bit's components use `teambit.react/react`
  as their env, which drags its preview runtime in — and as a _workspace component_ it carries a
  **version**, so even a workspace that did use react would have to match `@1.0.1042` exactly.

The artifact was therefore keyed to bit's dev workspace and unmatchable by anyone. This is fallout
from the core-env removal, not from bundling.

### 17c. Why the rspack fallback cannot be the answer

When the hash misses, `bit start` rebuilds. That path is broken on this branch in both builds:

- **bundled**: 228 errors, 356 of them `resolve-url-loader: webpack misconfiguration / upstream
loader did not supply a source-map`, plus `ESModulesLinkingError: export 'URL' … not found in
'url'` on `bit.app.js` itself.
- **non-bundled `bd start`**: `Cannot find module 'autoprefixer'`.

Fixing the fallback would mean shipping the whole UI dependency tree — the 1.1 GB the bundle exists
to avoid. Serving the pre-bundle is the only direction that pays.

### 17d. Alternatives considered for what goes _into_ the shipped pre-bundle

The artifact's aspect set is fixed at bit-build time; the workspace's varies. Three ways out:

| option                                                                                                              | effect                                                                                                                                                                                           | verdict                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **(a) core aspects only** — filter the task's resolved aspects to those bit itself ships                            | artifact = the 5 core aspects → `e23f10da`, exactly what a plain workspace computes → pre-bundle served, no rspack. A workspace using a react env resolves 6 and still falls back to rebuilding. | **chosen**                                                                 |
| (b) subset matching — (a) plus relaxing the runtime check from equality to "workspace aspects ⊆ pre-bundle aspects" | additionally avoids a pointless rebuild when a workspace needs _fewer_ aspects than the artifact carries; requires storing the id **list** in the artifact, not just its sha1                    | deferred — strictly better, but a behaviour change for non-bundled bit too |
| (c) keep react in the pre-bundle and make workspaces resolve it again                                               | closest to released-bit behaviour, but re-adds the react dependency surface the branch is shedding, and still mismatches unless every workspace pins the same react **version**                  | rejected                                                                   |

### 17e. Changes made

- **`getAspectArtifactDir(id, artifactDir)`** (`aspect-loader/core-aspects.ts`) — resolves an
  aspect's shipped `artifacts/` dir, trying the **running** bit first and falling back to bvm.
  `getBundleUiPath` and `getBundlePath` now use it, so a bundled bit serves _its own_ artifacts
  instead of a bvm install's. Verified: `bundleUiPath` now resolves locally.
- **`filterCoreAspectDefs(defs)`** (`aspect-loader/aspect-definition.ts`) — keeps aspects with no
  `component`, i.e. the ones resolved from bit's own installation. Applied in `PreBundlePreviewTask`
  and, via a `forPreBundle` flag on `UiMain.build`/`createBundleUiHash`, in `BundleUiTask`.
- **`generateBundleHash(aspects, outputPath)`** now hashes _the list that was bundled_ instead of
  re-resolving from the ui root, so the artifact and its `.hash` cannot disagree.
- **`cli-bundler`** copies each aspect's `artifacts/**` into its shim package and reports when none
  were shipped — a missing pre-bundle silently costs the whole UI dependency tree.
- **Debug logging** of both hashes, the chosen branch and the aspect id list in `writePreviewEntry`
  and `shouldServeBundleUi`. These decisions were entirely opaque before; the diagnosis above was
  only possible after adding them.

Two unrelated bugs surfaced and were fixed to get the build tasks green at all:

- **`@apollo/client` was unresolvable** from capsule pnpm stores (it is a peer of
  `@teambit/component`, so an aspect resolved out of a capsule has none above it). Added as a
  **directory** alias in `ui/rspack/rspack.common.ts` so the subpath entries share one copy — it
  carries React context, so a second copy silently breaks every `useQuery`, the same reason react is
  pinned there.
- **`@teambit/cloud.hooks.use-cloud-scopes` had no `dist/esm.mjs`** while its `exports` map declares
  `"import": "./dist/esm.mjs"`. Added the bridge. Note the **published** 2.0.72 package has the same
  hole — this is OQ3 biting in practice.

---

### 17f. The shims resolved **zero** preview aspects

With the artifacts shipped and the hashes agreeing under `bd`, the bundle still rebuilt. The log gave
it away: `currentBundleHash: da39a3ee5e6b4b0d3255bfef95601890afd80709` — the sha1 of the **empty
string**. A bundled bit resolved no preview aspects at all.

`getAspectDef(id, runtime)` discovers a runtime by globbing `<pkg>/dist` for `*.<runtime>.runtime.js`,
and `resolveAspects(runtime)` drops any aspect without one. The shims only ever emitted
`*.aspect.js` and `*.main.runtime.js`, so nothing was discoverable for `preview` or `ui` — and the
`.hash`, computed over that list, could never match a real artifact no matter how it was built.

Fixed by discovering every `*.<runtime>.runtime.*` in `core-aspects-info` and emitting one file per
runtime in the shim (5 `preview`, 28 `ui`). Their contents are never used — only the main runtime runs
in the CLI process, and the browser code was pre-bundled into `artifacts/` at build time — but their
_existence_ is what makes the aspect visible to `resolveAspects`.

Same pass fixed a latent naming bug: shim files were emitted as `compositions.aspect.js.js`, because a
`dist`-layout specifier keeps its `.js` and `generateOne` appended another. It worked only because
`getAspectDef` matches with `.includes('.aspect.js')`.

### 17g. Result

`bit start` from the bundle, against `/tmp/bundle-tests/start-ws`:

```
UI createRuntime of teambit.workspace/workspace, bundle will be served from
  /private/tmp/bit-bundle/dist/core-aspects/node_modules/@teambit/ui/artifacts/ui-bundle/workspace/public/bit
writePreviewEntry, currentBundleHash: e23f10da…, preBundleHash: e23f10da…
Rspack 2.1.8 compiled successfully in 4.15 s      ← the *env's* rspack, from the workspace
View 'start-ws' components at http://localhost:3800
```

HTTP 200 on the first poll, no `public/` written — both pre-bundles served, bit's own rspack never
runs.

|                                       | before                       | after                      |
| ------------------------------------- | ---------------------------- | -------------------------- |
| distribution with `bit start` working | **1.3 GB** (`--ui-bundling`) | **322 MB** (default build) |
| externals installed                   | 31                           | **12**                     |
| `bit start` in the default build      | fails                        | **works**                  |

The 322 MB is 231 MB of prior distribution + ~91 MB of shipped artifacts (72 MB scope UI bundle,
25 MB workspace UI bundle, 1.6 MB preview). The scope/workspace UI bundles are ~2× the released
2.0.72 ones (50 MB / 8.2 MB) — unexplained, and the obvious next size lever (§17h).

### 17h. Open after this

- **The UI artifact is 90.4 MB and is the biggest remaining size lever** — filed as
  [teambit/bit#10596](https://github.com/teambit/bit/issues/10596). Measured breakdown:

  | part                             | size        | files |
  | -------------------------------- | ----------- | ----- |
  | `ui-bundle/workspace` (browser)  | 22.6 MB     | 39    |
  | `ui-bundle/scope` (browser)      | 22.6 MB     | 54    |
  | `ui-bundle/scope/public/bit/ssr` | **45.2 MB** | 45    |

  Two separate problems. **(1)** `BundleUiTask` loops over both UI roots and runs a _full independent
  build_ per root, so the same React/monaco/component-compare code is compiled into both — they
  differ only in the root aspect id. Only 25 files / 1.9 MB are byte-identical, so file-level dedup
  buys nothing; the fix is one build with two entries sharing chunks. **(2)** the 45 MB SSR build is
  reachable only through `setupServerSideRendering`, which returns early unless `buildOptions.ssr` -
  set on `scope.ui-root.ts` only. `bit start` in a workspace never touches it, yet every install
  carries it. Largest single file is `scope/public/bit/ssr/index.js` at 38 MB.

  Also unexplained: the released 2.0.72 artifact is 58 MB against this branch's 90 MB, so it has
  grown as well.

- **A workspace whose env contributes preview aspects** still misses the hash and falls into the
  rebuild path, which a default bundle cannot do. It should fail with a clear message naming the
  aspects that forced it, rather than a wall of rspack module-not-founds. Option (b) in §17d (subset
  matching, storing the id list rather than just its sha1) would also shrink how often this happens.
- **`BundleCliAppTask` ordering**: `BundleUI`/`PreBundlePreview` and `BundleCliApp` are all
  `location: 'end'`. The bundler copies `artifacts/` out of the ui/preview packages, so it has to run
  _after_ they are produced. Unverified in a single real `bit build` of `@teambit/bit`.
- `postcss-flexbugs-fixes` / `postcss-normalize` are externals only because `postCssConfig` is a
  module-scope const (§E in `externals.ts`). Making it a function would drop two more externals and
  stop `postcss-preset-env` being evaluated on every bit command.
- ~~**`@rspack/core` (42 MB, the single biggest external)...**~~ **Done, 2026-08-19** - moved to
  `UI_BUNDLING_EXTERNALS` and stubbed for the default build (`stub-dev-only-plugin.ts`, extended to
  also throw correctly for a called-not-`new`'d export like `rspack(...)`). Externals 97 MB → 63 MB,
  shipped total 250 MB → 216 MB. Measured (hacky `require()` timing) that lazily-loading the _real_
  package on top of this would recover nothing further for the default build - the stub is ~0.2 ms to
  require either way - and would only matter for `--ui-bundling` builds, where it costs ~20 ms/command;
  deferred as low priority. See §14 2026-08-19 for the full trace and numbers, and §8.2/§8.3 of
  `08-externals-inventory.md`.
- `bufferutil` / `utf-8-validate` (~1 MB) are unrelated to UI/preview bundling - they're `ws`'s own
  optional peer deps (native WebSocket accelerators), pulled in via `create-remote-schemas.ts`'s
  GraphQL remote-schema stitching. `ws` already falls back to pure JS without them, so they may be
  droppable into `externalsNotInstalled` alongside `pnpapi`/`fsevents` - not verified.

### 17i. Producing a real local pre-bundle, and caching it (2026-08-18)

Until now every local artifact behind §17e-§17g was either produced during that original session or
faked for a specific test (§14 2026-08-13's planted artifact) - every attempt since then to
reproduce a real one locally was blocked by the `WorkspaceAspectsLoader` hang (§14 2026-08-16). That
hang is now fixed on this branch (`14399df10`/`53c59529e`, see
`scripts/circular-deps-check/CI-HANG-INVESTIGATION.md`), which unblocks it:

```bash
bd build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules \
  --tasks "BundleUI,PreBundlePreview"
```

**Use `bd` (this branch's own compiled code), not a bvm-linked released `bit`.** `teambit.preview/preview`
and `teambit.ui-foundation/ui` are core aspects - under a bvm-linked binary they resolve to _that
binary's own_ published packages, not this branch's modified source, so the task runs the pre-§17e
logic and produces nothing usable (and, separately, errored on an unrelated `@teambit/react`
resolution problem in the bvm install). See §14 2026-08-18 for the full trace.

The command above writes `artifacts/` into the `teambit.ui-foundation/ui` and `teambit.preview/preview`
**capsules** - `bit build` never writes anywhere under this repo's own `node_modules`.

Because producing this is slow and was, until this session, unreliable, a repo-local cache now
survives across `node_modules` wipes: `scopes/harmony/modules/cli-bundler/prebundle-cache.ts` has two
directions that read from different places, not simple mirrors of each other:

- `savePrebundleCache` (`npm run bundle:prebundle-cache:save`, run right after a successful
  `bd build ... --tasks BundleUI,PreBundlePreview`) locates the two capsules itself via
  `bit capsule list --json` and copies their `artifacts/` trees into
  `.bundle-cache/ui-preview-prebundle/` (gitignored), plus a `meta.json` recording the commit hash
  and timestamp they were captured at. **Pass the same binary the build ran with** via `BIT_BIN`
  (defaults to `bit` on `PATH`) - a bvm-linked released `bit` would look up capsules for _its own_
  published `teambit.ui-foundation/ui`/`teambit.preview/preview`, not this workspace's, since both are
  core aspects (§14 2026-08-18): `BIT_BIN=bd npm run bundle:prebundle-cache:save`.
- `restorePrebundleCache` (`npm run bundle:prebundle-cache:restore`) copies the other way, from the
  cache into `node_modules/@teambit/{ui,preview}/artifacts` - where a local (non-capsule)
  `npm run bundle` reads them from, since `packagesRoot` is the repo root there (`bundle-cli.ts`).
  `npm run bundle` calls this automatically before bundling, and only fills in an aspect's
  `artifacts/` dir if one is not already there — a real local build always wins over the cache.

This is a plain file cache, not a freshness gate against source changes: `meta.json` records the
commit/date so a person can judge whether it is worth refreshing, the script does not enforce it.

Verified end to end: `npm run bundle` reports `shipped artifacts: 161 files`, and `bit start` against
`/tmp/bundle-tests/start-ws` serves the UI shell from
`.../core-aspects/node_modules/@teambit/ui/artifacts/...` with no `public/` written — same signature
as §17g.
