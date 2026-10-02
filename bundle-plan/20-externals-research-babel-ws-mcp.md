# 16. Externals research: `@babel/core`, `bufferutil`/`utf-8-validate`, `mcp-config-writer` (2026-08-10)

[← back to bundle-plan index](../bundle-plan.md)

Prompted by: "research these externals — could they be removed?" Read-only investigation, no code
changed. Unlike §15's webpack/mocha (both turned out orphaned), all three of these are confirmed
load-bearing today — the useful output is _why_, precisely enough to know what would have to change
first.

### 16a. `@babel/core` — not droppable; sharper reason than "resolved by name"

**Not referenced by `babel-loader` string anywhere in this repo's tracked `scopes/` source.**
`grep -rn "babel-loader" scopes/` returns exactly one hit: the comment in `externals.ts:12` itself.

**Direct imports of `@babel/core`** (would need inlining if it weren't external):

- `scopes/compilation/babel/babel.main.runtime.ts:7` — `import * as babel from '@babel/core'`
- `scopes/compilation/modules/babel-compiler/babel-compiler.ts:1,3` — value import + `TransformOptions`
- `scopes/react/bit-react-transformer/bit-react-transformer.ts:1` — type-only import
- `scopes/compilation/babel/compiler-options.ts:1` — type-only import

**`BabelAspect` is still a core aspect** despite the react/node/mdx core-env removal on this branch:
`scopes/harmony/bit/manifests.ts:41,164`. So `@babel/core` has a live, direct consumer in the shipped
CLI regardless of the `babel-loader` question below.

**Where `babel-loader` string-resolution actually lives**: not in this repo's tracked source at all —
only in the _published_ `@teambit/react` package's webpack config builder
(`node_modules/.pnpm/@teambit+react@1.0.1042.../webpack/webpack.config.base.ts`, confirmed via
`grep -rl "require.resolve('babel-loader')" node_modules/.pnpm`). This repo's own
`scopes/react/react/` (the workspace-tracked react-env component) has no `webpack/` source dir left —
consistent with react-env removal. `@teambit/react` is externalized only under
`UI_BUNDLING_EXTERNALS` (`externals.ts`, the `--ui-bundling` opt-in group), not the base 10-entry
list — so this path is gated behind `bit start`/UI bundling, not the default CLI bundle. Matches §10
item 2's existing note that the 41 `require-resolve-not-external` warnings sit inside "config builders
for bundling _someone else's_ browser code."

**The load-bearing reason, sharper than "resolved by name at runtime"**: `babel-loader`
(`workspace.jsonc:448`, pinned `9.2.1`) declares `@babel/core` as a peer dependency it resolves via its
_own_ `require('@babel/core')` once webpack loads it as an installed package. If `@babel/core` were
inlined into `bit.app.js` instead of installed on disk as a real package, `babel-loader`'s internal
peer resolution has nothing to find — this fails independent of whether bit's own code imports it
directly. So `@babel/core` needs to stay resolvable as an installed package for as long as any
`babel-loader`/webpack-config-building path exists anywhere in the dependency graph, even one gated
behind `--ui-bundling`.

Also still unresolved: `@babel/core` is one of the 4 externals flagged at line ~727 as an _undeclared_
dependency of `@teambit/bit` — its version can't be resolved into the generated `package.json`, a real
`Cannot find module` risk at runtime for a published build. Fix is the same `bit deps set` noted in
§11C.

**Verdict**: not droppable today. This sharpens §8.2 item 3's existing "partly droppable" note — the
77 require sites being "bundled babel plugins asking for their peer" (§8.1) is exactly the
`babel-loader`-peer pattern above, generalized. Dropping it would require either (a) removing
`BabelAspect` from core (mirroring §15's webpack/mocha work — not yet investigated whether it's as
clean) or (b) resolving `webpack.config.base.ts`'s `babel-loader` dependency from the user's workspace
instead of bit's own installation, which is the same "resolve from workspace, don't ship a second
copy" direction as §8.2 items 1–2.

### 16b. `bufferutil` / `utf-8-validate` — load-bearing, not a no-op

**`ws` usage**: exactly one import site in `scopes/`:
`scopes/harmony/graphql/create-remote-schemas/create-remote-schemas.ts:9` (`import ws from 'ws'`).

**Genuinely installed here, with compiled native binaries** — unlike `pnpapi`/`fsevents`
(`externals.ts:100`, `externalsNotInstalled`, confirmed never-installed no-ops):

- `node_modules/.pnpm/bufferutil@4.0.3/.../build/Release/bufferutil.node`
- `node_modules/.pnpm/utf-8-validate@5.0.5/.../build/Release/validation.node`
- Pinned directly: `workspace.jsonc:673` (`"ws": "7.5.10"`), with both native packages listed in
  `allowScripts` (`workspace.jsonc:15-22`, needed so pnpm runs their native build scripts) and present
  as root-importer deps in `pnpm-lock.yaml`.

**Confirmed optional peer with graceful fallback**, in the installed `ws@8.21.1`:
`package.json` — `peerDependenciesMeta: { bufferutil: {optional:true}, utf-8-validate: {optional:true} }`.
Source has the try/catch:

- `ws/lib/buffer-util.js:114-127` — `try { require('bufferutil') ... } catch (e) { /* Continue regardless */ }`
- `ws/lib/validation.js:143-149` — same pattern for `utf-8-validate`

**Why esbuild can't just skip them if externalized status were dropped**: `bufferutil`/`utf-8-validate`
are literal `require('bufferutil')` calls — statically analyzable, and since the packages are actually
installed (not absent like `pnpapi`), esbuild would successfully resolve and attempt to inline them
rather than skip them. Both load their `.node` binary via the standard node-gyp-build
`path.join(__dirname, ...)` pattern; under esbuild's bundle `__dirname` collapses to the flat bundle
dir, so the binary lookup breaks. This is exactly category A's own rationale
(`externals.ts:8-9`, "esbuild can only inline JavaScript").

**Verdict**: §8.1's "droppable: yes" is a _product_ question — do we want `ws`'s native perf
accelerators at all, or is the pure-JS fallback acceptable, in which case the two packages could be
removed from `workspace.jsonc`/`allowScripts` entirely and `ws` would fall back gracefully with zero
code changes. It is not a statement that bundling them while installed is safe — it isn't. The actual
lever here is upstream of `externals.ts`: stop installing the two native packages (or drop `ws`'s
optional peer deps in an override), and the externals-list entries become removable as a consequence,
not the other way around.

### 16c. `@teambit/mcp.mcp-config-writer` — structurally required; not a "could be removed" item

**Real source in this repo**: `components/mcp/mcp-config-writer/mcp-config-writer.ts` — a workspace
component, not just a published dependency (resolves via a `file+components+mcp+mcp-config-writer`
pnpm link).

**The template-reading method isn't literally `loadRulesTemplate`** — `copy-assets.ts:29`'s comment
paraphrases; the real method is `static async getDefaultRulesContent(...)`
(`mcp-config-writer.ts:503-527`), which reads a template by disk path exactly as `copy-assets.ts`'s own
doc comment describes for this whole asset category:

```
mcp-config-writer.ts:525  const templatePath = path.join(__dirname, templateName);
mcp-config-writer.ts:526  return fs.readFile(templatePath, 'utf8');
```

**The three templates** (`components/mcp/mcp-config-writer/`), selected by
`consumerProject`/git-presence flags at `mcp-config-writer.ts:516-523`:

- `bit-rules-template.md` — default Bit MCP agent instructions (non-git workspace)
- `bit-git-rules-template.md` — same, for git-integrated workflows
- `bit-rules-consumer-template.md` — instructions for projects that _consume_ Bit components
  (npm-install flow) rather than develop them

Written out to AI-coding-assistant config locations — `.claude/bit.md`
(`mcp-config-writer.ts:491-496`), `.cursor/rules/bit.rules.mdc` (`:444`), etc. — so these are rules
files that teach agents like Claude Code / Cursor how to use Bit's MCP tools.

**Confirmed genuinely necessary**: the published package's `dist/` layout
(`node_modules/.pnpm/@teambit+mcp.mcp-config-writer@0.0.9/.../dist/`) has all three `.md` files
sitting alongside the compiled JS, matching `copy-assets.ts:30`'s glob `dist/bit-*-template.md`.
Since these are non-JS assets read by disk path at runtime, esbuild cannot pull them into `bit.app.js`
— `copyAssets` is structurally required for as long as this feature exists.

**Possible alternative** (not implemented, just noted for later): the templates could become build-time
JS string constants instead — e.g. an esbuild `text`-loader import, or a small codegen step emitting a
template-literal module — turning `getDefaultRulesContent` into a pure in-memory lookup with zero disk
I/O and removing this `copy-assets.ts` entry entirely. Trade-off: loses the ability to edit/inspect the
templates as loose files post-build, and requires touching `mcp-config-writer.ts`'s read path (component
code, not just the bundler) plus its own compile step.

**Same undeclared-dependency issue as §16a**: `@teambit/mcp.mcp-config-writer` is, per the note at line
~731, likewise an undeclared dependency of `@teambit/bit` — same `bit deps set` fix needed alongside the
4 externals already tracked there.

_(superseded 2026-08-11: the "possible alternative" below is now implemented and shipped — see §18.
`copy-assets.ts` no longer has an entry for this package, and the undeclared-dependency note above no
longer applies to it specifically, since there's no longer a copied asset depending on the published
package's resolvable version.)_

### 16d. Bottom line

None of the three are droppable _from the externals list_ in isolation — each has a structural reason
(native-binary-can't-be-inlined for the `ws` pair, peer-resolved-from-disk for babel, non-JS-asset for
mcp-config-writer) that `externals.ts`/`copy-assets.ts`'s own category comments already predict. The
real levers all live one layer up, and match §8.2's existing ordering:

- `@babel/core` — droppable only if `BabelAspect` leaves the core manifest (unexamined; same shape as
  §15's webpack/mocha work) or `babel-loader`'s dependency is resolved from the user's workspace.
- `bufferutil`/`utf-8-validate` — droppable only if the native accelerators are removed from `ws`'s
  install (a `workspace.jsonc`/`allowScripts` change, not a bundler change).
- `mcp-config-writer` — not droppable at all while the feature exists; only its _mechanism_ (copied
  asset vs. inlined string) is a lever, and a small one.

### 16e. Follow-up — does anything call the local `BabelAspect`? Does the UI/preview pre-bundle change babel's runtime necessity? (2026-08-11)

Two follow-ups on §16a, mirroring §15d's split between "is the tool used" and "is the _local aspect
wrapper_ used."

**Does anything use the babel aspect?**

Zero callers of `BabelMain.createCompiler()` (`babel.main.runtime.ts:17`) in this repo's shipped
application code — same shape as mocha (§15b) and webpack's `WebpackMain.createDevServer()`/
`createBundler()` (§15d). Every call site is either:

- Documentation usage examples: `scopes/harmony/aspect-docs/node/node.mdx:151`,
  `scopes/envs/aspect-docs/envs/envs.mdx:315`, `scopes/react/aspect-docs/react/react.mdx:157`.
- e2e test fixtures under `components/legacy/e2e-helper/excluded-fixtures/extensions/{babel-env,
multiple-compilers-env}/*.extension.ts` — copied into throwaway workspaces by
  `e2e-fixtures-helper.ts:81`, exercised by a dedicated suite, `e2e/harmony/babel.e2e.ts` ("compile
  with babel" / "compile simple javascript component").

Unlike mocha, this isn't dead code — `e2e/harmony/babel.e2e.ts` is a maintained, first-class test
proving `teambit.compilation/babel`'s public API (`createCompiler()`, composed into a custom env via
`react.overrideCompiler()`) works end to end for a user authoring their own babel-based env. It's a
documented, supported feature, just one with zero consumers among bit's own shipped core envs. So:
**not orphaned like mocha, but also not exercised by anything that ships inside `bit.app.js`** — the
CLI bundle carries `BabelAspect`/`BabelMain` (`manifests.ts:41,164`) purely so a user _could_ call this
API, not because bit's own code calls it. Same conclusion as webpack/mocha in §15d: `BabelAspect` is a
candidate for the same "de-register from the core manifest" treatment — this was flagged as unexamined
in §16d and is now confirmed structurally identical to the two already-actioned cases.

This is independent of §16a's `babel-loader`-peer-resolution argument — that's about the _npm package_
`@babel/core` needing to remain an installed peer for `babel-loader`, which is published inside
`@teambit/react` (an external package, unrelated to the local `BabelAspect`). Removing `BabelAspect`
from `manifests.ts` would eliminate the 4 direct-import call sites in `babel.main.runtime.ts`/
`babel-compiler.ts`/`bit-react-transformer.ts`/`compiler-options.ts`, but has **zero effect** on the
`babel-loader` peer-dependency requirement below — these are two independent reasons `@babel/core` is
external, and de-registering the aspect only removes one of them.

**Does the UI/preview pre-bundle change whether `babel-loader` needs `@babel/core` at runtime?**

No — the pre-bundle work in flight on this branch (`pre-bundle.task.ts`, `pre-bundle-utils.ts`,
`preview.main.runtime.ts`, `RUNTIME_NAME = 'preview'` at `pre-bundle.ts:22`) is orthogonal to the
`babel-loader` path, for two independent reasons:

1. **What gets pre-built doesn't use babel at all.** The pre-bundle mechanism pre-builds the _preview
   app shell_ — the Harmony bootstrap code that renders a component's composition/docs inside its
   iframe — via `createRspackConfig` (`pre-bundle.ts:18`, `scopes/preview/preview/rspack/
rspack.config.ts`). That config has no `babel-loader` reference (the only `babel` match in that file
   is an unrelated comment about `@babel/register` and the mocha-tester, `rspack.config.ts:33`); rspack
   uses its own built-in loader for this shell, not babel. So regardless of whether the pre-bundle hash
   matches and the shell is served from a shipped artifact instead of rebuilt
   (`preview.main.runtime.ts:906-910`, `writePreviewEntry`'s branch on `currentBundleHash ===
preBundleHash`), babel was never in that code path either way.
2. **`babel-loader` lives in a separate, inherently per-component pipeline that can't be pre-baked.**
   It's inside the _published_ `@teambit/react` package's webpack config (`webpack.config.base.ts:
137,161`, per §16a) — used by `@teambit/preview.react-preview`'s webpack-based bundler/dev-server,
   which `mdx-env` and `node.node` still route through (§15a). That pipeline transpiles _each
   component's own source code_ for its composition/docs preview — content that differs per workspace
   and changes on every edit, so by nature it cannot be built once and shipped as a static artifact the
   way the shell can. It runs live, on the user's machine, every time `bit start` dev-serves or
   `bit build` previews an mdx-env/node.node component.

So the pre-bundle feature reduces the frequency of _one specific_ rspack invocation (the app shell), but
has no bearing on the _other_, webpack+`babel-loader` pipeline that `mdx-env`/`node.node` depend on —
`@babel/core` remains a **runtime** dependency, not a build-time-only one, for as long as those two envs
(or any other env using the webpack-based `react-preview`) exist and get dev-served or previewed. The
only way to make `@babel/core` purely build-time here is the direction already implied by §15a: migrate
`mdx-env`/`node.node` off the webpack-based `react-preview` onto the pure-rspack pipeline `react-env`
already uses. That's unstarted, and a materially bigger change than the current pre-bundle work.
