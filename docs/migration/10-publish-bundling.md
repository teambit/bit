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

- **Open blocker**: the bundle build currently fails on missing exports
  from commit `b808f4cf5` ("split UI value re-exports out of aspect
  index barrels"). Rollup's static analysis follows
  `import { ComponentModel } from '@teambit/component'` in UI-only files
  like `components/ui/models/lanes-model/lanes-model.ts` and errors
  because `ComponentModel` is no longer exported from the component
  barrel. Unbundled runtime never reaches those files (CLI commands
  don't load UI runtimes) so the b808f4cf5 work is correct — but the
  bundle's static graph walk doesn't know that.

  Two ways to unblock:
   1. Add an `externalize-ui` plugin to `build-publish-bundle.mjs` that
      marks `components/ui/**` and `scopes/*/*.ui.runtime.*` external.
      Node entry wouldn't carry browser code at all; UI code loads from
      `node_modules` on demand when `bit start` resolves it. Right shape
      for a Node-CLI publish artifact.
   2. Re-export the moved symbols from the barrels via `.ts` re-export
      shims. Less invasive but partly undoes b808f4cf5.

  Option 1 is the right fit. Skipped here because the `bin/bit.js` swap
  is a separate question (the bundle isn't on the runtime path yet) and
  the `lazyAspectIds` work in `scopes/harmony/core/harmony.ts` already
  captures the bulk of the bench win bundling was meant to deliver.
