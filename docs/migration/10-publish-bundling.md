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

- [ ] `npm run build-bundle` produces `dist/bundle/bit.mjs` + chunks dir.
- [ ] Entry bundle is <5MB.
- [ ] Each `.main.runtime.ts` produces its own named chunk.
- [ ] Source maps work end-to-end (thrown error → original TS location).
- [ ] Benchmark scenarios improve vs unbundled lazy baseline.
- [ ] CI publishes only the bundle (not source).
- [ ] Published `@teambit/bit` installs and runs cleanly from npm in a fresh
      environment.
- [ ] Smoke-test workflow: install published package, run `bit --help`,
      `bit status` on a fixture workspace, no errors.

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
