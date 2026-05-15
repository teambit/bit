# Chunk 09 — CJS → ESM Source Migration

| Field | Value |
| --- | --- |
| Depends on | — (architecturally independent; can run in parallel from day 1) |
| Blocks | 10 (publish bundle), 11 (cleanup) |
| Risk | High |
| Effort | 10+ days; split into 4–6 sub-PRs |

## Goal

Convert the workspace from CommonJS to native ESM source emission, one cohort
of packages at a time. After this chunk lands, every package emits `.js` ESM
with `"type": "module"`.

## Why parallel-safe

This work is mechanical and architecture-independent. The lazy-aspect chunks
work in both CJS and ESM — they just work *better* in ESM because dynamic
`import()` is native instead of bolted-on. Two engineers can run chunks 02–08
and chunk 09 in parallel.

## Why high-risk

Bit has ~200 packages, deep dep chains, mixed peer/dev/prod deps, and
ts-node-style runtime resolution that has its own quirks. Even with a
codemod, edge cases are guaranteed.

## Scope

### TypeScript config changes

Per package:

- `tsconfig.json`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`,
  `target: "ES2022"` (or higher).
- `package.json`: `"type": "module"`, `"exports": { ".": "./dist/index.js" }`.

### Source changes

- **All relative imports get `.js` extensions**:
  `import { x } from './foo'` → `import { x } from './foo.js'`.
  (Yes, even though the source is `.ts`. ESM requires this.)
- **`__dirname` / `__filename`** → `import.meta.url` + `fileURLToPath`.
- **`require()` calls** → `await import()` or `createRequire(import.meta.url)`
  for CJS-only third-party deps.
- **`module.exports = ...`** → `export default` / named exports.

### Codemod

`scripts/codemod/cjs-to-esm.mjs`:

1. Walk all `.ts` files in a package.
2. Add `.js` to relative imports.
3. Detect `__dirname` / `__filename` and rewrite.
4. Detect `require(...)` calls; convert to `await import(...)` if the caller
   is async, else inject `createRequire` and rewrite.
5. Update `package.json` and `tsconfig.json`.

Manual cleanup expected for ~10–20% of files.

### Cohort plan

Migrate leaves first (no internal deps), then mid-tier, then harmony core last.

| Cohort | Packages | Notes |
| --- | --- | --- |
| Cohort 1 — pure utilities | `legacy-utils/*`, `string/*`, `path/*` | No aspect dependencies |
| Cohort 2 — toolbox aspects | `logger`, `config`, `cli` | Few deps, well-tested |
| Cohort 3 — component model | `component`, `bit-id`, `bit-error` | Foundation for everything |
| Cohort 4 — workspace + scope | `workspace`, `scope`, `aspect-loader` | The big middle |
| Cohort 5 — heavy domains | `compiler`, `tester`, `pkg`, `install`, `react`, `angular`, `vue` | Each large; consider one PR per |
| Cohort 6 — top + entrypoint | `harmony`, `bit`, `bvm-bin` | Last; flips the default |

### Interop during overlap

While some packages are CJS and others ESM:

- **CJS package consumes ESM**: not directly possible until Node
  `--experimental-require-module` lands stable, or use a wrapper. Mitigation:
  migrate consumers before producers; or include a small CJS re-export wrapper
  in the ESM package's `package.json` `exports` field for the transition.
- **ESM package consumes CJS**: works fine with default imports.
  Just use `import x from 'cjs-pkg'`.

Plan: order cohorts so consumers are migrated **after** producers when possible.
This is the opposite of leaves-first; in practice it means migrating in two
passes (leaf-then-trunk or trunk-then-leaf, choose based on dep direction).

### Build pipeline

- The TypeScript compiler in Bit's pipeline must emit ESM for migrated packages.
- The Babel pipeline (if used) must too.
- Webpack/Rollup configs in env aspects need updates.

## Acceptance criteria

- [ ] Every package has `"type": "module"` and emits ESM `.js`.
- [ ] `bit compile` runs clean across the workspace.
- [ ] All unit tests pass (mocha needs `--loader=ts-node/esm` or similar).
- [ ] All e2e tests pass.
- [ ] `bit watch` works on ESM packages.
- [ ] Bench harness (chunk 01) shows no regression vs the equivalent CJS state.
- [ ] `scopes/harmony/bit/hook-require.ts` is deleted (CJS-only artifact).
- [ ] Documentation updated to instruct users to publish ESM aspects.

## Risks

- **`mocha` and other CJS-only test runners** struggle with ESM. Mitigation:
  migrate test config per cohort; consider switching to Vitest (separate
  conversation, separate chunk if needed).
- **Third-party CJS deps** that we expect to consume directly. Mitigation:
  `createRequire`; Node interop generally works.
- **TypeScript paths and barrel files**. The `.js` extension dance is annoying;
  consider using TS 5+ `moduleResolution: "Bundler"` if applicable, otherwise
  bite the bullet.
- **Hot-reload during `bit watch`**. ESM modules are immutable once imported.
  Affects how `bit watch` reloads — needs verification per cohort.

## Files touched

Effectively every `.ts` file plus most `package.json` and `tsconfig.json`.
This is the largest chunk by volume.

## Out of scope

- Switching test runners (Vitest, etc.) — a separate decision.
- Module bundling (chunk 10).
- Removing `require`-based legacy loaders entirely (chunk 11).
