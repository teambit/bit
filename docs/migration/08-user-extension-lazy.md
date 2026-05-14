# Chunk 08 — User / Workspace Extensions Use `harmony.resolve`

| Field | Value |
| --- | --- |
| Depends on | 03 |
| Blocks | 11 |
| Risk | Medium |
| Effort | ~2 days |

## Goal

Replace the special-case loader for user (workspace) extensions with the same
`harmony.resolve` path that core aspects use. One mental model, one code path.

## Why now

Today's user-extension loader lives in `workspace.main.runtime.ts` and uses
synchronous `require()` via the aspect-loader. After ESM and lazy-resolve are
in place, this is technical debt: a separate code path that does the same job
worse.

## Background: today

```ts
// scopes/workspace/workspace/workspace.main.runtime.ts (paraphrased)
cli.registerOnStart(async (_hasWorkspace, currentCommand, commandObject) => {
  if (commandObject?.loadAspects === false) return;
  const aspects = await workspace.loadAspects(
    aspectLoader.getNotLoadedConfiguredExtensions(),
    undefined,
    'teambit.workspace/workspace (cli.registerOnStart)',
    loadAspectsOpts,
  );
});
```

This calls into `aspect-loader.main.runtime.ts` which does
`require(aspectFilePath)`. CJS-only; mid-tier abstraction; multiple flags.

## Scope

### New `harmony.loadExternalAspect(manifestPath)` API

```ts
// scopes/harmony/harmony/harmony.ts
async loadExternalAspect(manifestPath: string): Promise<unknown> {
  // 1. Dynamic-import the .aspect.js to get the Aspect manifest.
  const aspectMod = await import(manifestPath);
  const aspect = pickAspectExport(aspectMod);
  if (!aspect) throw new Error(`No Aspect export in ${manifestPath}`);

  // 2. Register the manifest (transitively, including its declared deps).
  this.registerManifestTransitive(aspect);

  // 3. Resolve — same path as core aspects.
  return this.resolve(aspect.id);
}
```

`pickAspectExport` heuristic: look for a default export, then any export
that's an instance of `Aspect`.

### Resolve external paths

User aspects live under `node_modules/<package>/dist/<aspect>.aspect.js`. The
existing aspect-loader already resolves this path; reuse its resolution code
but call `harmony.loadExternalAspect(resolvedPath)` instead of `require(...)`.

### Replace `workspace.loadAspects`

```ts
// New shape
async loadAspects(aspectIds: string[]) {
  return Promise.all(aspectIds.map(async (id) => {
    const path = await this.aspectResolver.resolve(id);
    return this.harmony.loadExternalAspect(path);
  }));
}
```

Returns the resolved aspect instance(s). Existing callers expecting the old
return type may need small adjustments.

### Compatibility

- The `command.loadAspects` boolean still works: when false, the `onStart`
  hook does nothing.
- Aspects authored before this migration (CJS, no `runtimes` thunk) need a
  compatibility shim: if `aspect.runtimes` is missing, fall back to importing
  the colocated `*.main.runtime.js` directly. This bridges the gap until users
  republish their aspects.

## Acceptance criteria

- [ ] User extensions configured in `workspace.jsonc` load via
      `harmony.loadExternalAspect` — verified with a fixture workspace.
- [ ] The old `aspect-loader`'s synchronous `require()` paths for user aspects
      are removed (kept temporarily for CJS-compat shim).
- [ ] `command.loadAspects = false` still skips loading.
- [ ] E2E tests for user-aspect scenarios pass (workspace with custom envs,
      custom commands, slots).
- [ ] Benchmark `status` on a workspace with 5 user aspects loads only the
      user aspects on the command path, not all of them.

## Risks

- **User aspects published as CJS**. Mitigation: compatibility shim wraps
  CJS aspects so they can be `import()`ed (Node's `--experimental-require-module`
  or a thin wrapper).
- **Resolution path corner cases**: pnpm hoisting, scoped packages, monorepo
  layouts. Mitigation: reuse the existing `aspect-loader` resolution code; only
  swap the load step.
- **Ordering**: today, user aspects load on `onStart` (before command handler).
  Keep that ordering — `cli.registerOnStart` still triggers
  `loadExternalAspect`. The change is internal to how loading happens.

## Files touched

- `scopes/harmony/harmony/harmony.ts` (new `loadExternalAspect`)
- `scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts` (delegate to
  harmony for the load step)
- `scopes/workspace/workspace/workspace.main.runtime.ts` (use new API)

## Out of scope

- Bundling user aspects (they remain unbundled npm packages).
- Lazy-loading user aspects per-command (still all load on `onStart` unless
  command opts out — that's a separate optimization).
