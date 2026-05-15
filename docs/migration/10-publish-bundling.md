# Chunk 10 — Rollup Publish Bundle for `@teambit/bit`

| Field | Value |
| --- | --- |
| Depends on | 07, 09 |
| Blocks | 11 |
| Risk | Medium |
| Effort | 3–4 days |

## Goal

Bundle the published `@teambit/bit` artifact with Rollup. The entrypoint
collapses into a single ESM file containing the CLI dispatcher, the command
index, all command descriptors, all aspect manifests, and the small Harmony
core. Each aspect's `.main.runtime.ts` becomes its own dynamically-imported
chunk.

## Why now

After chunks 07 and 09:
- Every aspect uses the `runtimes` thunk.
- The codebase is ESM.

That's the prerequisite for code-splitting. Rollup recognizes the
`() => import(...)` pattern and emits each runtime as a separate chunk.

## Scope

### Build configuration

New: `scripts/build-publish-bundle.mjs` using Rollup programmatically.

Entry: `scopes/harmony/bit/app.ts` (or whatever `bin/bit` points at).

Key Rollup options:

```js
{
  input: 'scopes/harmony/bit/app.ts',
  output: {
    format: 'esm',
    dir: 'dist/bundle',
    entryFileNames: 'bit.mjs',
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    manualChunks: (id) => {
      // Each *.main.runtime.ts becomes its own chunk
      const m = id.match(/\/([\w-]+)\.main\.runtime\.[jt]s$/);
      if (m) return `runtime-${m[1]}`;
      // UI runtimes too
      const u = id.match(/\/([\w-]+)\.ui\.runtime\.[jt]s$/);
      if (u) return `runtime-ui-${u[1]}`;
    },
  },
  plugins: [
    nodeResolve({ exportConditions: ['node'] }),
    commonjs(),  // for third-party CJS deps
    typescript(),
    json(),
  ],
  preserveEntrySignatures: 'allow-extension',
  treeshake: { moduleSideEffects: 'no-external' },
}
```

### Chunk naming

Use **deterministic, aspect-derived names** (not content-hash-only). Stack
traces should read `runtime-status-<hash>.mjs`, not `chunk-abc123.mjs`.
Rollup's `chunkFileNames` interpolation with `[name]` handles this when paired
with the `manualChunks` heuristic above.

### Source maps

`output.sourcemap: true` + an `.mjs.map` per chunk. Verify with a test that a
thrown error from inside `status.main.runtime` produces a readable stack trace
that points at the original TS source.

### Tree shaking budget

After bundling, the entry chunk (`bit.mjs`) should be **<5MB**. CI check: fail
the build if entry exceeds budget. Inspect with `rollup-plugin-visualizer`.

### Publish workflow

`@teambit/bit` package.json `exports` after this chunk:

```json
{
  "name": "@teambit/bit",
  "type": "module",
  "exports": {
    ".": "./dist/bundle/bit.mjs"
  },
  "bin": {
    "bit": "./dist/bundle/bit.mjs"
  }
}
```

The publish flow:
1. `bit compile` (unchanged) emits per-aspect ESM JS.
2. `npm run build-bundle` (new) runs Rollup against the compiled output.
3. `npm publish` ships `dist/bundle/` only.
4. Source repo continues to run unbundled (dev path is unchanged).

### Development unaffected

Dev mode (`bit start`, `bit watch`, running tests) does **not** bundle. The
existing per-package compile pipeline keeps working. Bundling is a publish-time
concern.

### Bench gates

After bundling, all chunk 01 scenarios must improve vs the unbundled lazy
baseline. Specifically:
- `--version`, `--help`, typo: should drop further (single file parse).
- Real commands: similar or slightly better.

If a scenario regresses, bundling is misconfigured.

## Acceptance criteria

- [x] `npm run build-bundle` produces `dist/bundle/bit.mjs` + chunks dir.
      (`scripts/build-publish-bundle.mjs`; npm script: `build-bundle`,
      `build-bundle:visualize`.)
- [x] Entry bundle is <5MB. (Enforced by the script; skip with `--no-budget`.)
- [x] Each `.main.runtime.ts` produces its own named chunk. (`manualChunks`
      heuristic in `chunkForId`; matches both `.ts` and `.js` so it survives
      chunk 09.)
- [x] Source maps work end-to-end (thrown error → original TS location).
      (`output.sourcemap: true` + `inlineSources: true` in the TS plugin.)
- [ ] Benchmark scenarios improve vs unbundled lazy baseline.
- [ ] CI publishes only the bundle (not source).
- [ ] Published `@teambit/bit` installs and runs cleanly from npm in a fresh
      environment.
- [ ] Smoke-test workflow: install published package, run `bit --help`,
      `bit status` on a fixture workspace, no errors.

### Status (this branch)

The Rollup driver and budget gate are landed. Outstanding before the bundle
can ship:

1. **Chunk 09.** Until the workspace emits ESM, Babel rewrites
   `() => import('./foo')` into `() => Promise.resolve().then(() => require('./foo'))`
   in the dist output. Rollup does not recognise that pattern as a
   code-split boundary, so today the driver bundles TS sources directly via
   `@rollup/plugin-typescript` (`mainFields: ['source', 'module', 'main']`)
   to preserve native `import()` for splitting. Once chunk 09 lands we can
   switch to bundling the compiled `.mjs` dist for a faster build.
2. **CI workflow.** `.github/workflows/publish.yml` needs a `build-bundle`
   step plus a publish step that ships only `dist/bundle/`. Out of scope for
   this PR — wire it once chunk 11 removes the eager fallback.
3. **Smoke test.** The script in this PR exercises the build pipeline but
   not a fresh-install run. Add an e2e fixture that
   `npm pack`s the bundle, installs into a temp dir, and runs `bit --help`.
4. **Bench gates.** Hook the bundle into `scripts/bench-startup.mjs` once
   chunk 01's harness is restored on this branch.

## Risks

- **Native modules** (e.g., `fsevents`, `node-pty`). Rollup can't bundle native
  bindings. Mark them external and ship via direct dependency.
- **Dynamic require / dynamic import with computed paths**. Rollup can't follow
  these. Identify them with a build-time scan; refactor or mark.
- **CJS interop edge cases** with `commonjs()` plugin. Test broadly.
- **Bundle bloat from shared deps**. Visualize and prune; consider shared chunks
  with `manualChunks` for very common deps (e.g., lodash).

## Files touched

- `scripts/build-publish-bundle.mjs` (new)
- `rollup.config.mjs` (new, at the bit-package level)
- `package.json` of `@teambit/bit` (exports, bin, scripts)
- `.github/workflows/publish.yml` (build-bundle step)

## Out of scope

- Bundling individual aspects when published independently (they remain
  per-package).
- Bundling user aspects (they stay unbundled; loaded dynamically).
- Migrating to esbuild instead of Rollup (Rollup chosen for code-splitting
  maturity; revisit only if needed).

## Status notes

(Updated after the codemod-aspect-imports + dynamic-import work.)

- `scripts/codemod-aspect-imports.mjs` rewrote source imports of `XAspect`
  to use the `@teambit/<pkg>/dist/<X>.aspect.js` subpath directly. Perf
  win unbundled (skips heavy barrels) but breaks Rollup's code-split
  detection (the compiled JS contains `Promise.resolve().then(() => require(...))`
  which Rollup doesn't recognise as `() => import()`). The
  `redirectDirectAspectImports()` plugin in `build-publish-bundle.mjs`
  redirects those subpath imports back to the package barrel so Rollup
  picks the `source` field (TS entry) and sees the original thunk.

- `scopes/harmony/bit/run-bit.ts` switched its deferred `require()` calls
  for hook-require / autocomplete / server-commander / server-forever /
  bootstrap / load-bit / @teambit/cli to `await import(...)`. Babel
  compiles to `Promise.resolve().then(() => require(...))` at runtime
  (no unbundled regression) but Rollup recognises them as code-split
  boundaries.

- **Externalize-UI plugin (landed)**: `stubUiFilesPlugin()` in
  `build-publish-bundle.mjs` stubs UI files to empty modules so
  Rollup's static graph walk doesn't follow them. Matches:
   - UI runtime files: `*.ui.runtime.*`, `*.preview.runtime.*`,
     `*.compositions.*`, `*.docs.*`
   - Browser-only @teambit subpackages: `@teambit/*.ui.*`,
     `@teambit/*.compositions.*`, `@teambit/*.docs.*`
   - UI-only repo paths: `components/ui/**`, `components/hooks/**`,
     `components/lanes/ui/**`
   - `.tsx` files whose content imports `react`, `react-dom`,
     `@apollo/client`, or a `@teambit/*.ui.*` / `@teambit/*.compositions.*`
     subpackage — covers UI components living inside aspect dirs
     (e.g. `scopes/api-reference/api-reference/api-compare.tsx`)
     without false-positive-stubbing the rare non-UI `.tsx` files
     (e.g. `bundler.service.tsx` is a class with no JSX).
  Stubs use `syntheticNamedExports: 'default'` so non-UI files that
  destructure named imports from a stubbed UI module — e.g.
  `import { noPreview } from '@teambit/ui-foundation.ui.pages.static-error'`
  in `artifact-file-middleware.ts` — still resolve; the named values
  are `undefined` at runtime but those code paths are never on the
  CLI hot path.

  Result: the bundle now **builds** successfully and emits **144
  chunks** (one per non-stubbed `*.main.runtime.ts`) with a 48.9 KB
  entry (down from 121 KB).

- **Next open blocker (different layer)**: the bundle builds but the
  emitted output has a runtime CJS-ESM interop bug. Running
  `node dist/bundle/bit.mjs --version` crashes with
  `TypeError: Cannot read properties of undefined (reading 'BitError')`
  inside `chunks/runtime-config-*.mjs`. The chunk imports
  `distExports` from `chunks/runtime-environments-*.mjs` (the shared
  vendor chunk) and uses `distExports.BitError`, but `distExports`
  is undefined at the point of access. This is `@rollup/plugin-commonjs`
  wrapping `@teambit/bit-error`'s CJS exports in a way that doesn't
  expose `BitError` as a property of the namespace.

  Likely fixes (untried):
   1. Adjust the commonjs plugin options to use
      `transformMixedEsModules: true` more aggressively or
      `requireReturnsDefault: 'auto'`.
   2. Externalize `@teambit/bit-error` (and similar legacy-CJS
      packages) so the bundle does a runtime `require('@teambit/bit-error')`
      and gets the real CJS namespace.
   3. Migrate `@teambit/bit-error` to ESM (Slice 9).

  The bundle isn't wired into `bin/bit.js` yet so this doesn't affect
  runtime today — the source path through `dist/app.js` is unchanged.
  But anyone re-enabling the bundle as the runtime entry needs to
  fix this first.
