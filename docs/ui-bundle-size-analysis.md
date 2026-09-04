# UI and preview bundle size — analysis and remaining levers

Working notes for shrinking the pre-built bundles bit ships. Written 2026-08-18, updated 2026-08-19
once the whole stack had merged (see _Where this started_). Pick this up from **Remaining levers**.

Out of scope here, by decision: the per-env preview pre-bundle duplication (~31 MB of byte-identical
`env-template` output across the six core envs). The core envs are being removed, which takes that
with them.

## Where this started

[#10596](https://github.com/teambit/bit/issues/10596) — the shipped `@teambit/ui` artifact was 58 MB.

| PR                                                  | change                                                                 | artifact  |
| --------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| —                                                   | released 2.0.82                                                        | 58 MB     |
| [#10628](https://github.com/teambit/bit/pull/10628) | drop the `eval-*` devtool from the ssr build, minify it, fix scope ssr | 24 MB     |
| [#10629](https://github.com/teambit/bit/pull/10629) | both UI roots as two entries of one compilation                        | **16 MB** |
| [#10631](https://github.com/teambit/bit/pull/10631) | `bit start` sanity e2e for both roots, plus review follow-ups          | 16 MB     |

Current shipped artifact, measured from the `BundleUI` capsule output:

| part                                                | emitted   |
| --------------------------------------------------- | --------- |
| `ui-bundle/public/bit/static` (browser, both roots) | 8.2 MB    |
| `ui-bundle/public/bit/ssr` (scope only)             | 7.9 MB    |
| **total**                                           | **16 MB** |

Plus `@teambit/preview/artifacts` at 0.9 MB.

## How to reproduce the measurements

```bash
BIT_UI_BUNDLE_STATS=1 bit build "teambit.ui-foundation/ui, teambit.preview/preview" \
  --tasks "BundleUI,PreBundlePreview" --reuse-capsules --unmodified
node scripts/analyze-bundle.mjs bundle-stats/*.stats.json     # or: npm run analyze-bundle
```

Writes `bundle-stats/{browser,scope-ssr,preview}.stats.json` (gitignored) and prints assets plus the
heaviest packages. `BIT_UI_BUNDLE_STATS` can also be a directory path.

Two traps worth knowing:

- **rspack does not clean its output directory**, and `--reuse-capsules` reuses the capsule, so
  consecutive builds accumulate both runs' assets and every size reads high. `rm -rf` the capsule's
  `artifacts/` between measured builds.
- Sizes reported under `modules:` are **parsed, pre-minification**, so they are larger than what
  ships and are only useful for comparing packages against each other. The `assets:` numbers are
  the real emitted bytes.

Totals as of this writing: browser 16.08 MB parsed / 8.59 MB emitted; scope-ssr 17.03 MB parsed /
8.21 MB emitted; preview 1.96 MB parsed / 0.92 MB emitted.

## What the browser bundle is made of

Heaviest packages, parsed (`browser.stats.json`, 670 packages total):

| MB   | share | package             |
| ---- | ----- | ------------------- |
| 1.45 | 9.5%  | `@shikijs/langs`    |
| 1.34 | 8.7%  | `highlight.js`      |
| 1.00 | 6.5%  | `react-dom`         |
| 0.85 | 5.5%  | `refractor`         |
| 0.63 | 4.1%  | `@apollo/client`    |
| 0.58 | 3.7%  | `date-fns`          |
| 0.52 | 3.4%  | `lodash`            |
| 0.45 | 2.9%  | `sucrase`           |
| 0.21 | 1.4%  | `xregexp`           |
| 0.19 | 1.2%  | `@remix-run/router` |

The ssr bundle is the same graph (`react-dom`, `highlight.js`, `refractor`, `@shikijs/langs` in the
same order), so anything fixed for the browser is fixed twice over.

**Chunking.** Of 34 emitted assets, one — `static/js/528.*.js` at 6.23 MB — is the whole vendor
graph, plus a 0.53 MB CSS file. The remaining ~1.4 MB is lazy `.chunk.js` files, and those are
almost entirely `@shikijs/langs`. So: everything except the shiki language files loads up front.
This is the default `splitChunks` behaviour (`defaultVendors` puts all of `node_modules` in one
chunk with no `maxSize`), not a deliberate choice.

**Shiki is the pattern to copy.** `components/ui/diff-viewer/shiki-imports.ts` maps language ids to
`() => import('@shikijs/langs/<lang>')`, so 1.45 MB across 26 languages sits in lazy chunks and is
fetched per language. Nothing else in the UI does this.

## Remaining levers

Ranked by size against effort. Nothing here is done.

### 1. Two full syntax-highlighting language registries load eagerly — ~2.3 MB parsed

`highlight.js` (1.34 MB, 192 modules — _every_ language) and `refractor` (0.85 MB, 279 modules —
every Prism language) are both in the eager chunk. Neither is imported directly anywhere in this
repo.

They arrive through `react-syntax-highlighter`, whose package **root** re-exports every build:

```js
export { default } from './default-highlight'; // highlight.js, all languages, via lowlight
export { default as Prism } from './prism'; // refractor, all languages
export { default as PrismLight } from './prism-light';
export { default as createElement } from './create-element';
```

Importing anything at all from the root pulls both registries. The light builds
(`prism-light`, `light`) exist precisely to avoid this and take explicit `registerLanguage` calls —
`components/ui/code-view/code-view.tsx` already uses `prism-light` correctly.

**The blocker is that the remaining root imports are not in this repo.** They are in _published_
`@teambit` components resolved from `node_modules`:

- `@teambit/api-reference.renderers.schema-node-member-summary` → `dist/function-node-summary.js`
- `@teambit/documenter.ui.code-snippet`

`scopes/api-reference/renderers/schema-node-member-summary/` contains only a `node_modules`
directory — there is no source for it here. **Verified:** fixing the in-repo root imports alone
changes the artifact by 0 bytes, because these two keep the root entry in the graph.

Options:

1. Fix the published components upstream to use `prism-light`. Correct, but out of this repo.
2. Alias the registries to their language-free cores in `rspack.common.ts`:
   `lowlight` → `lowlight/lib/core`, `refractor` → `refractor/core`. **Attempted and rejected for
   now**: bit fails the build with a missing-dependency issue (`rspack/rspack.common.ts -> lowlight,
refractor`) because both are transitive, so they would have to be declared dependencies of
   `@teambit/ui`. It is also a behaviour change — any consumer relying on the auto-registered
   languages silently degrades to unhighlighted text, which is a product call, not a build one.
3. `NormalModuleReplacementPlugin` on the root entry, same trade-off as 2 without the dependency
   declaration.

Tracked as [#10633](https://github.com/teambit/bit/issues/10633). It needs a decision on 1 vs 2 first. Note `@shikijs/langs` (1.45 MB) is a _third_
highlighting stack — already lazy, so not a size problem, but three highlighters in one app is worth
questioning on its own.

### 2. `lodash` cannot be tree-shaken — 0.52 MB in the UI, 0.52 MB (28%!) of the preview bundle

`node_modules/lodash/package.json` has `main: lodash.js` and **no `module` field**, so it is CJS
only and no bundler can drop the unused ~95% of it.

The repo has **280 `import … from 'lodash'` statements and zero cherry-picked `lodash/<fn>`
imports.** The preview bundle is the sharp case: 0.52 MB of a 1.96 MB bundle is lodash, imported for
`compact`, `uniq`, `flatten`, `debounce`, `intersection`, `isObject`.

Fix: `lodash-es` (has an ESM entry, tree-shakes; not currently installed) or per-function imports.
Mechanical, no behaviour change, and it pays out in the UI bundle, the ssr bundle and the preview
bundle at once. Probably the best effort-to-reward item on this list.

### 3. `graphql` ships whole — 0.52 MB, 28% of the preview bundle

The full `graphql` package (parser, validator, printer) is in the preview bundle, which only needs
to _send_ queries. `graphql-request` and `@apollo/client` both pull it. Worth checking whether the
preview runtime can use a pre-parsed document or a lighter client. In the browser bundle it is
smaller (0.19 MB) because Apollo pulls only part of it.

### 4. `sucrase` — 0.47 MB of a JS transpiler in a UI bundle

Pulled in by `react-live` (the live code playground). Nothing imports `react-live` directly in this
repo, so it is transitive. A playground is the definition of a lazy-load candidate: it is not
needed until someone opens one. `React.lazy` / dynamic `import()` at the component that mounts it.

### 5. `date-fns` — 0.60 MB across 302 modules

No direct import in the repo; transitive, most likely via `react-datepicker` (0.12 MB browser,
0.55 MB in ssr). 302 modules means the whole package, so tree-shaking is not happening through
whatever imports it. Check the importer's import style before assuming this is fixable here.

### 6. One 6.23 MB eager chunk — a runtime lever, not a size one

This does not change total bytes, but it decides what a user waits for. Splitting the vendor chunk
(`splitChunks.maxSize`, or explicit cache groups for react / apollo / editor stacks) would let the
browser parallelise the download and — more valuably — stop invalidating 6.23 MB of cache every time
any dependency changes.

Note the service worker no longer claims navigations at all: with an entry per root there is no
single app shell, so #10631 removed the `navigateFallback` that still pointed at an `index.html`
this build stopped emitting. Any future work here has to decide what an offline shell means for two
roots before re-adding one.

Related measurement from #10628: with a warm cache, ssr renders first paint in 72 ms vs 384 ms
client-only; with a cold cache it is 584 ms vs 376 ms, because 6.4 MB of JS dominates. Shrinking or
splitting the eager chunk is what closes that cold-cache gap.

### 7. Duplicate package versions — a correctness risk, not a size one

81–86 packages appear at more than one version in a single bundle (`@teambit/design.ui.tooltip` at
eight). Total waste is only ~0.6 MB (~3%), so this is not a size lever — but a duplicated package
that calls `createContext` yields two distinct contexts, which is exactly the bug that broke scope
ssr in #10628 (`use-user-agent` at 0.0.199 and 0.0.200). The mitigation is per-package entries in
`resolveAlias` in `rspack.common.ts`. Worth a sweep of which duplicated packages export a context.

## Rough sizing

Very approximate, since parsed bytes shrink under minification:

| lever                      | parsed             | difficulty                                   |
| -------------------------- | ------------------ | -------------------------------------------- |
| highlighter registries (1) | ~2.3 MB ×2 bundles | blocked on an upstream fix or a product call |
| lodash (2)                 | ~0.5 MB ×3 bundles | mechanical                                   |
| graphql in preview (3)     | ~0.5 MB            | needs investigation                          |
| sucrase / react-live (4)   | ~0.45 MB ×2        | small, localized                             |
| date-fns (5)               | ~0.6 MB ×2         | needs investigation                          |

## Tooling notes

`scripts/analyze-bundle.mjs` buckets modules by npm package and by workspace scope. Caveats found
while writing it:

- rspack's `toJson` **groups** assets and modules into summary rows by default ("assets by status"),
  which carry a size but no name and read as one large unattributable bucket. `bundle-stats.ts`
  disables every `groupModulesBy*` / `groupAssetsBy*` flag for this reason.
- Per-chunk module lists stay grouped even so, which is why eager-vs-lazy above is derived from
  emitted asset sizes rather than from chunk membership.
- `reasons` is off (it makes the stats file very large). To find _why_ a package is in the graph,
  turn it on temporarily, or grep `node_modules/*/dist` for the import — which is how the
  `react-syntax-highlighter` root importers in (1) were found.
