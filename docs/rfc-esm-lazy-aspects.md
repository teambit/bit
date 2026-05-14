# RFC: ESM Migration with Lazy-Loaded Aspects

| Field | Value |
| --- | --- |
| Status | Draft |
| Owner | TBD |
| Target | Bit core (`@teambit/bit`) + Harmony runtime |
| Companion docs | `docs/node-modules-optimization.md` |

## 1. Summary

Migrate the Bit codebase from CommonJS to native ESM **without** regressing CLI startup latency, by introducing a three-tier loading architecture:

1. A **build-time bundle** of the CLI dispatcher + command index + command descriptors, produced when `@teambit/bit` is published.
2. **Lazy aspect runtimes** loaded via dynamic `import()` on demand, with each `*.main.runtime` shipped as a separate code-split chunk.
3. **Unified lazy loading** that applies the same mechanism to user-defined workspace extensions as to core aspects.

Today, `bit <command>` instantiates every core aspect and every command class at startup. After this RFC, only the aspects on a given command's transitive dependency path are loaded — typically a small fraction of the total. The published `@teambit/bit` artifact gains a generated command index and a bundled entry; runtime cost approaches "parse one small file, then `import()` exactly what is needed".

## 2. Motivation

Two forcing functions:

- **The CommonJS-to-ESM migration is coming** (toolchain pressure, peer ecosystem moving). A naive port — replacing `require` with top-level `import` — would eliminate the inline-`require()` lazy-load escape hatches that exist today, making startup measurably slower.
- **Startup is already a known sore spot**. `BitAspect` (defined at `scopes/harmony/bit/bit.main.runtime.ts:18`) declares ~120 core aspects from `scopes/harmony/bit/manifests.ts:119-228` as static dependencies. `harmony.run(requireAspects)` at `scopes/harmony/bit/load-bit.ts:295` walks the whole graph and runs every `provider()` before yargs even sees argv. Every command class — `StatusCmd`, `InstallCmd`, etc. — is instantiated regardless of what the user typed.

The migration is therefore the right moment to fix the underlying loading model, not a moment to lose ground.

## 3. Current architecture (as observed)

### 3.1 Aspect file shapes

`.aspect.ts` files are already pure manifests. From `scopes/harmony/cli/cli.aspect.ts`:

```ts
import { Aspect, RuntimeDefinition } from '@teambit/harmony';
export const MainRuntime = new RuntimeDefinition('main');
export const CLIAspect = Aspect.create({
  id: 'teambit.harmony/cli',
  dependencies: [],
  declareRuntime: MainRuntime,
});
```

These files are tiny and have no domain-code imports. The manifest/runtime split is already half-implemented.

### 3.2 Where weight lives

`.main.runtime.ts` files carry the cost. From `scopes/component/status/status.main.runtime.ts:1-33`, `StatusMain` imports 30+ Aspect values plus domain code. Crucially, dependencies are imported as **values** (the `Aspect` objects), not types, so the dependency graph is materialized at parse time.

Each provider eagerly instantiates command classes inside `cli.register(...)`:

```ts
// status.main.runtime.ts (paraphrased)
StatusMain.provider = async ([cli, workspace, ...]) => {
  const statusMain = new StatusMain(...);
  cli.register(new StatusCmd(statusMain), new MiniStatusCmd(statusMain));
  return statusMain;
};
```

### 3.3 Current "lazy" loading

Three mechanisms exist:

1. **CJS hook** at `scopes/harmony/bit/hook-require.ts:1-31` — intercepts requires for SCSS/CSS stubs. Not a lazy-loader; not relevant after ESM.
2. **Workspace-aspects loaded on `onStart`** at `scopes/workspace/workspace/workspace.main.runtime.ts` — user extensions are loaded only after the command is identified, gated by `command.loadAspects`. This **is** real lazy loading but applies only to user aspects.
3. **`require()` inside aspect-loader functions** at `scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts:649` — used to load `.main.runtime.js` for non-core aspects. Synchronous CJS-only.

Core aspects are **not** lazy in any meaningful sense: `Harmony.load([CLIAspect, BitAspect])` at `load-bit.ts:289` followed by `harmony.run(requireAspects)` at `load-bit.ts:295` loads and runs every core provider.

### 3.4 CLI dispatch flow

From the entry binary at `scopes/harmony/bit/app.ts`:

```
app.ts → runBit() → bootstrap() → runCLI()
  → loadBit()                        // Harmony.load + harmony.run (eager)
  → cli.run(hasWorkspace)            // cli.main.runtime.ts:140
    → invokeOnStart                  // OnStart slot hooks (workspace aspects load here)
    → new CLIParser(this.commands).parse()   // yargs config from commandsSlot
    → commandRunner.runCommand()     // invokes command.report / .json / .wait
```

Everything past `loadBit()` is already async. There is no synchronous barrier blocking the migration.

## 4. Goals and non-goals

### Goals

- **G1**: Cold-start latency for `bit --version` and `bit --help` is dominated by parsing a single bundled entry file (<50ms target).
- **G2**: `bit <command>` loads only aspects on the command's transitive runtime path, plus a small fixed CLI core.
- **G3**: Feature parity. Every slot, every hook, every CLI behaviour available today still works.
- **G4**: User workspace extensions use the same lazy-load mechanism as core aspects — no two paths to maintain.
- **G5**: The published `@teambit/bit` package is the only place that needs to be bundled. Source code stays as plain ESM TypeScript.

### Non-goals

- Not switching DI frameworks. Harmony stays; we extend it.
- Not redesigning the aspect model. `.aspect.ts` / `.main.runtime.ts` separation stays.
- Not introducing a new module format (JSR, etc.). Plain Node ESM.

## 5. Proposed architecture

### 5.1 Three tiers of loading

```
┌────────────────────────────────────────────────────────────────┐
│ TIER 0 — Bundled entry (parsed once, ~tens of ms)              │
│   bin/bit.mjs                                                  │
│   ├── CLIMain (dispatcher, yargs adapter, hooks)               │
│   ├── command-index.generated.json                             │
│   ├── All *.commands.ts descriptors (pure data, inlined)       │
│   ├── All *.aspect.ts manifests (transitively, via BitAspect)  │
│   └── Tiny Harmony core (registry + resolve())                 │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ await import() per command
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ TIER 1 — Aspect runtime chunks (loaded on demand, code-split)  │
│   chunks/status.main.runtime.<hash>.mjs                        │
│   chunks/install.main.runtime.<hash>.mjs                       │
│   chunks/...                                                   │
│   Each chunk: aspect class + its non-shared deps               │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ for user-defined aspects
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ TIER 2 — User workspace extensions (loaded on demand from FS)  │
│   node_modules/<user-aspect>/dist/*.main.runtime.js            │
│   Same import() mechanism — just different source path         │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Bundling strategy

- Published `@teambit/bit` is built with **Rollup** (preferred over esbuild here — superior code-splitting heuristics for shared-chunk extraction).
- Entry: `scopes/harmony/bit/app.ts`.
- Bundler is configured to treat every `*.main.runtime.ts` as a **dynamic-import boundary**. Each becomes its own chunk; shared deps are hoisted into common chunks.
- The bundled artifact ships under `@teambit/bit/dist/` with `package.json#exports` pointing at the entry `.mjs`.
- The source repo is **not** bundled for development. `bit-dev` and tests use the unbundled TS via the existing ts-node / compile pipeline. Bundling is a publish-time concern only.

### 5.3 Why this is faster than today

| Cost | Today | After |
| --- | --- | --- |
| Module-graph parse at startup | ~120 core aspects + transitive | 1 bundled entry chunk |
| Provider invocations at startup | All ~120 core providers | Only CLI + Logger |
| Command class instantiations at startup | All ~150 commands | Zero (descriptors only) |
| `bit --help` cost | Full bootstrap | Read inlined descriptors, render |
| `bit <typo>` cost | Full bootstrap, then error | Index lookup, then error |
| `bit status` aspects loaded | All ~120 | ~15 (status + transitive) |

V8 also parses one large file faster than the equivalent code split across hundreds of small files (fewer module-record allocations, better inline-cache locality).

The dominant win is **subset loading** (never importing what isn't needed), not parallelism — `import()` does pipeline I/O, but module top-level code runs serially on the JS main thread, so parallel imports of three heavy aspects evaluate one-at-a-time. The prototype (§11) confirms this. Bundling is still valuable for the aspects that *do* load, because V8 parses one big file faster than N small ones.

## 6. Detailed design

### 6.1 Extended `Aspect.create`

```ts
// scopes/harmony/harmony/aspect.ts
export interface AspectOptions {
  id: string;
  dependencies?: Aspect[];
  declareRuntime?: RuntimeDefinition;
  defaultConfig?: Record<string, unknown>;

  // NEW: lazy runtime loaders, keyed by runtime name.
  // Bundler rewrites these into code-split imports.
  runtimes?: Record<string, () => Promise<Record<string, unknown>>>;

  // NEW: lazy command descriptor module.
  // Loaded eagerly by the bundler at build time and inlined.
  commands?: () => Promise<{ default: CommandDescriptor[] }>;
}
```

Each `.aspect.ts` adds two lines:

```ts
export const StatusAspect = Aspect.create({
  id: 'teambit.component/status',
  dependencies: [], // existing
  declareRuntime: MainRuntime,
  runtimes: {
    main: () => import('./status.main.runtime.js'),  // NEW
  },
  commands: () => import('./status.commands.js'),    // NEW
});
```

The thunk form keeps the runtime import lazy even when the manifest is loaded eagerly. The bundler recognizes the thunk pattern and emits a code-split chunk; at runtime the thunk resolves to the chunk URL.

### 6.2 Command descriptors

A new sibling file per aspect that registers commands:

```ts
// scopes/component/status/status.commands.ts
import type { CommandDescriptor } from '@teambit/cli';

const descriptors: CommandDescriptor[] = [
  {
    name: 'status',
    alias: 's',
    description: 'show workspace component status and issues',
    group: 'development',
    options: [
      ['j', 'json', 'return a json version of the component'],
      ['w', 'warnings', 'show warnings'],
      // ...
    ],
    loader: true,
    loadAspects: true,
    // aspectId is needed so the dispatcher knows which runtime to load
    aspectId: 'teambit.component/status',
  },
];

export default descriptors;
```

`CommandDescriptor` is a strict subset of today's `Command` interface — everything **except** `report`, `json`, `wait` (the handlers). Handlers live in the runtime chunk and bind themselves to the dispatcher when the runtime loads.

Today's `Command` interface (at `scopes/harmony/cli/command.ts:6-131`) is split:

```ts
// command.ts (new shape)
export interface CommandDescriptor {
  name: string;
  alias?: string;
  description: string;
  group?: Group | string;
  options: CommandOptions;
  arguments?: CommandArg[];
  commands?: CommandDescriptor[];
  loader?: boolean;
  loadAspects?: boolean;
  remoteOp?: boolean;
  skipWorkspace?: boolean;
  helpUrl?: string;
  private?: boolean;
  extendedDescription?: string;
  examples?: Example[];
  aspectId: string;       // NEW — required
}

export interface CommandHandlers {
  report?(args: CLIArgs, flags: Flags): Promise<string | Report>;
  json?(args: CLIArgs, flags: Flags): Promise<GenericObject>;
  wait?(args: CLIArgs, flags: Flags): Promise<void>;
}

export interface Command extends CommandDescriptor, CommandHandlers {}
```

A command class is `class StatusCmd implements Command` exactly as today — no source change to the class itself. The descriptor file is a **declarative duplicate** of the static fields, used by the bundler.

To avoid duplication drift, a build-time check verifies that descriptor static fields match the class fields. Mismatch fails the build.

### 6.3 Generated command index

Produced at publish time, committed under `scopes/harmony/bit/command-index.generated.ts`:

```ts
// AUTO-GENERATED — do not edit by hand
export interface CommandIndexEntry {
  aspectId: string;
  runtimeChunk: string;     // bundler-rewritten path to the chunk
}

export const COMMAND_INDEX: Record<string, CommandIndexEntry> = {
  status:    { aspectId: 'teambit.component/status',  runtimeChunk: './chunks/status.runtime.mjs' },
  's':       { aspectId: 'teambit.component/status',  runtimeChunk: './chunks/status.runtime.mjs' },
  install:   { aspectId: 'teambit.dependencies/install', runtimeChunk: './chunks/install.runtime.mjs' },
  // ...
};

// All command descriptors, inlined at build time.
// Bundler resolves the import()s in *.aspect.ts#commands at build time
// and concatenates the descriptors into this array.
export const ALL_DESCRIPTORS: CommandDescriptor[] = [
  /* inlined from every *.commands.ts */
];
```

Generation pipeline:

1. Codegen script walks every `.aspect.ts` and follows the `commands` thunk.
2. For each descriptor it emits a row in `COMMAND_INDEX`.
3. Rollup output names are post-processed to fill `runtimeChunk` paths.
4. `ALL_DESCRIPTORS` is the union, used to drive yargs config without any runtime imports.

### 6.4 Modified `Harmony` loader

```ts
// scopes/harmony/harmony/harmony.ts (new shape, sketch)
export class Harmony {
  private manifests = new Map<string, Aspect>();
  private instances = new Map<string, unknown>();
  private loading = new Map<string, Promise<unknown>>();

  // `manifestOnly` are registered (for later lazy discovery) but NOT resolved.
  // `rootAspects` are both registered and resolved immediately.
  // The split lets the entry point register every known manifest cheaply
  // (manifests are tiny pure-data files) without paying the cost of resolving
  // any runtime that isn't on the active command's path.
  static async load(
    rootAspects: Aspect[],
    runtime: string,
    config: ConfigMap,
    manifestOnly: Aspect[] = [],
  ): Promise<Harmony> {
    const h = new Harmony(runtime, config);
    for (const a of [...rootAspects, ...manifestOnly]) h.registerManifestTransitive(a);
    await Promise.all(rootAspects.map(a => h.resolve(a.id)));
    return h;
  }

  async resolve(aspectId: string): Promise<unknown> {
    if (this.instances.has(aspectId)) return this.instances.get(aspectId);
    if (this.loading.has(aspectId)) return this.loading.get(aspectId);

    const p = (async () => {
      const aspect = this.manifests.get(aspectId);
      if (!aspect) throw new Error(`Unknown aspect: ${aspectId}`);

      const runtimeMod = await aspect.runtimes![this.runtimeName]();
      const runtimeClass = pickRuntimeExport(runtimeMod);  // any export with .provider
      // Lazy manifest discovery: the runtime class may reference Aspect
      // manifests that weren't registered via the original root closure.
      for (const d of runtimeClass.dependencies ?? []) this.registerManifestTransitive(d);
      const deps = await Promise.all(
        (runtimeClass.dependencies ?? []).map((d: Aspect) => this.resolve(d.id))
      );
      const slots = this.buildSlots(runtimeClass.slots ?? []);
      const cfg = this.config.get(aspectId);
      const instance = await runtimeClass.provider(deps, cfg, slots, this);
      this.instances.set(aspectId, instance);
      return instance;
    })();

    this.loading.set(aspectId, p);
    return p;
  }

  // Sync getter for the case where caller knows it's already resolved.
  get<T>(aspectId: string): T {
    if (!this.instances.has(aspectId)) {
      throw new Error(`Aspect ${aspectId} not yet resolved. Use resolve() instead.`);
    }
    return this.instances.get(aspectId) as T;
  }
}
```

Key invariants:

- `resolve()` is the only entry point that triggers a load. It is reentrant-safe via the `loading` map.
- Dependency loads happen in parallel via `Promise.all` over independent subtrees.
- `provider()` signatures are **unchanged**. The 4th argument (`harmony: Harmony`) stays; callers that previously used `harmony.get(id)` synchronously must switch to `await harmony.resolve(id)` if the target may not be resolved.

### 6.5 CLI dispatcher changes

The bundled entry runs:

```ts
// scopes/harmony/bit/app.ts (new shape)
import { COMMAND_INDEX, ALL_DESCRIPTORS } from './command-index.generated.js';
import { coreManifests } from './core-manifests.js';   // all .aspect.ts only

async function main() {
  const argv = process.argv.slice(2);
  const cmdName = argv[0];

  // Fast paths that need no aspect loads:
  if (!cmdName || cmdName === '--help' || cmdName === '-h') return printHelp(ALL_DESCRIPTORS);
  if (cmdName === '--version' || cmdName === '-v')          return printVersion();
  if (cmdName === 'completion')                              return runCompletion(ALL_DESCRIPTORS);

  const entry = COMMAND_INDEX[cmdName];
  if (!entry) return printUnknownCommand(cmdName, ALL_DESCRIPTORS);

  // Real path: minimal Harmony, resolve only what we need.
  const harmony = await Harmony.load([CLIAspect], 'main', await loadConfig());
  await harmony.resolve(entry.aspectId);   // triggers transitive dynamic imports
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  await cli.runResolvedCommand(cmdName, argv.slice(1));
}
```

`CLIMain.runResolvedCommand` is a new method that runs `onStart` hooks, then asks yargs to parse just *this* command's options (built from the descriptor), then invokes the handler. Yargs no longer sees the full command list — it sees one, which is faster to build.

For commands with `loadAspects: true`, the resolved aspect's `provider()` will have wired up `cli.registerOnStart(...)` that loads workspace aspects (existing logic preserved).

### 6.6 Slot contributions across aspects

Aspect A contributing to aspect B's slot requires A's provider to run before B uses the slot value. With lazy loading, A might not load at all.

Most slot use today is additive (`commandsSlot`, `OnStartSlot`, etc.) — consumed at command-dispatch time, by which point any contributor that's on the loaded path has run. The risk is contributions from aspects that are *not* on the loaded path.

Resolution: each slot declares a **producers manifest**. When `harmony.resolve(B)` runs and B uses a slot, the loader also resolves every declared producer of that slot. The manifest is generated alongside `COMMAND_INDEX` by static analysis of `.slotContribute()` / `slot.register()` call sites.

For slots where this is too restrictive (rare), we fall back to declaring the slot as "best-effort, partial view".

### 6.7 User workspace extensions

Same mechanism, different source. When `workspace.loadAspects()` runs (today at `scopes/workspace/workspace/workspace.main.runtime.ts`):

```ts
// New shape (sketch)
async function loadUserAspects(aspectIds: string[]) {
  for (const id of aspectIds) {
    const resolved = await resolveUserAspectPath(id); // node_modules/.../package.json
    const manifestMod = await import(resolved.aspectFile);
    const manifest: Aspect = manifestMod.default ?? findAspectExport(manifestMod);
    harmony.registerManifest(manifest);
    await harmony.resolve(manifest.id);
  }
}
```

User aspects use the **same** `Aspect.create({ runtimes: { main: () => import('./x.main.runtime.js') } })` shape. They are not bundled (each lives in its own npm package), but their lazy contract is identical.

This means: a single mental model for core and user aspects, one loader code path, one performance story.

### 6.8 Slot producer index

Generated alongside the command index:

```ts
export const SLOT_PRODUCERS: Record<string, string[]> = {
  'teambit.harmony/cli:commandsSlot': [
    'teambit.component/status',
    'teambit.dependencies/install',
    // ...
  ],
  'teambit.harmony/cli:onStartSlot': [
    'teambit.workspace/workspace',
    // ...
  ],
};
```

Used by `Harmony.resolve()` when an aspect declares it consumes a slot.

## 7. Migration plan

Each phase is independently shippable, individually revertable, and gated on benchmarks.

### Phase 1 — Codegen the command index (no behaviour change)

- Build the codegen script that walks `.aspect.ts` + `*.commands.ts` and emits `command-index.generated.ts`.
- Run it as part of `bit compile` for the publish artifact.
- At startup, **assert** that the generated index matches the live `commandsSlot` after eager bootstrap. Divergence → loud failure.
- No descriptors yet; the script reads command static fields directly from the runtime classes.

**Output**: a generated file that's currently unused.
**Risk**: low (additive).

### Phase 2 — Extract command descriptors

- For each aspect that registers commands, add `*.commands.ts`.
- Refactor the command class so its static fields read from the descriptor (single source of truth).
- Update `cli.register(...)` call sites to take a descriptor + a handler factory:
  ```ts
  cli.register(statusDescriptor, () => new StatusCmd(statusMain));
  ```
  Keep the old positional-class form working too.
- Build check asserts descriptor↔class agreement.

**Output**: descriptors used by `bit --help`, `completion`, and unknown-command paths without loading providers.
**Risk**: medium (touches ~50–80 files; mechanical).

### Phase 3 — Add lazy `runtimes` thunks to `Aspect.create`

- Extend `AspectOptions` with `runtimes` and `commands`.
- Add the two thunks to every `.aspect.ts` (one-line each).
- Bundler config recognizes the thunks and emits chunks. Verify by running `rollup --analyze` and confirming each runtime is its own chunk.

**Output**: a publishable bundle where chunks exist but Harmony still loads eagerly.
**Risk**: medium (build pipeline change).

### Phase 4 — Lazy `Harmony.resolve`

- Implement `Harmony.resolve(id)` and the manifest/loading/instances maps.
- Convert `Harmony.load(rootAspects)` to only resolve the roots, not the whole closure.
- Implement the slot-producer index.
- Add `BIT_EAGER_LOAD=1` env var that restores Phase 0 behaviour for safety.
- Migrate `harmony.get(id)` synchronous-on-not-yet-loaded call sites to `await harmony.resolve(id)`. Static analysis to find them; most are inside providers and naturally async-friendly.

**Output**: real lazy loading. Benchmarks should show first measurable wins here.
**Risk**: high. This is the heart-transplant phase. Run dual-mode (eager + lazy) in CI for a release.

### Phase 5 — Convert TS source to ESM emit, package by package

- Leaves first (utilities), then mid-tier, then harmony core last.
- Use Node `--experimental-require-module` during the overlap to let remaining CJS aspects require ESM ones.
- One PR per cohort: set `"type": "module"`, emit `.js` ESM with explicit extensions, fix imports.
- Drop `hook-require.ts` and the CJS-only escape hatches.

**Output**: pure-ESM Bit.
**Risk**: high but well-trodden territory.

### Phase 6 — Drop eager fallback, finalize bundling

- Remove `BIT_EAGER_LOAD` fallback.
- Lock in Rollup production config for `@teambit/bit` publish.
- Strip dead code: old `requireAspects` walk, CJS-only utilities.
- Document the new aspect-authoring contract.

**Output**: clean ESM-only Bit with bundled CLI and lazy aspects.
**Risk**: low (cleanup).

## 8. Performance validation

### Benchmark suite (committed, run on every PR)

| Scenario | Today (CJS, eager) | Target |
| --- | --- | --- |
| `bit --version` | ~1.5s | <100ms |
| `bit --help` | ~1.5s | <150ms |
| `bit <typo>` | ~1.5s | <100ms |
| `bit status` (no workspace) | ~1.5s | <300ms |
| `bit status` (small workspace, ~20 components) | ~2.5s | <500ms |
| `bit status` (large workspace, ~500 components) | ~6s | <2s |

Measured cold (`node --no-experimental-fetch ...`, fresh module cache) and warm (with `NODE_COMPILE_CACHE`).

### Regression gates

- PR fails if any benchmark regresses by >10%.
- CI assertion: `bit status` on a fixture workspace must load fewer than `N` aspects (start `N=20`, ratchet down).

### Tracing

- `BIT_TRACE_ASPECT_LOAD=1` prints `[load] teambit.component/status (12ms, parents: cli)`.
- Useful for finding accidental eager loads after the migration.

## 9. Risks and open questions

### Settled by user input

- **Where the index lives** → generated at publish time into the `@teambit/bit` artifact.
- **Slot contributions** → preserve feature parity; correctness wins over micro-perf where they conflict.
- **User extensions** → same lazy-load path as core.
- **Bundler vs Node-native** → use whichever is faster; this RFC picks Rollup-bundled core + dynamic chunks.

### Still open

1. **Sourcemaps + stack traces across chunks.** Rollup supports this but the chunk-name strategy needs to preserve aspect identity in stacks. Plan: deterministic chunk naming (`status.runtime.mjs`, not `chunk-abc123.mjs`).
2. **Hot-reload during `bit watch`.** If runtime chunks are bundled at publish but devs run unbundled TS, the dev path stays as-is. Need to confirm no developer-facing regression.
3. **`require()` from third-party packages that target CJS.** Plan: `createRequire` shims at chunk boundaries; covered by Node ESM interop.
4. **`Harmony.resolve` API churn.** Every `harmony.get(id)` that may hit an unresolved aspect needs to become `await resolve`. Plan: codemod + types-only lint that flags `harmony.get` on aspects not in the current call site's transitive `dependencies` declaration.
5. **Slot-producer index correctness.** Static analysis of `slot.register` call sites is the source of truth. Need to handle dynamic registrations (rare; flag at build).
6. **Bundle size budget.** A 50MB bundled entry would defeat the purpose. Target: <5MB for the Tier 0 entry. Rollup `--treeshake` plus marking heavy domain code as runtime-only (which it already is, since it lives in `.main.runtime.ts`) should keep us well under.

## 10. PoC slices (work order)

Each slice is sized to a single PR / 1–3 day task and produces something measurable.

| # | Slice | Deliverable | Why this order |
| --- | --- | --- | --- |
| 1 | **Bench harness** | `scripts/bench-startup.mjs` measuring the 6 scenarios above against current code. Baseline numbers committed. Includes **per-aspect isolated-import timing** (one aspect imported in a fresh Node process, repeated) so we know the marginal cost of each aspect — not just whole-command wallclock. | Need ground truth before changing anything. The prototype showed that under parallel load, per-aspect numbers are smeared by sibling threads' top-level CPU; isolate to attribute correctly. |
| 2 | **Index codegen** | Script that walks `.main.runtime.ts` files, extracts command static fields, emits `command-index.generated.ts`. Runtime assertion that it matches live state. | Zero behaviour change, builds the data foundation. |
| 3 | **Descriptor extraction (one aspect)** | Convert `status` aspect to use `status.commands.ts`. Update `cli.register` signature to accept descriptor + handler factory. | Prove the descriptor shape on one real aspect before the bulk rollout. |
| 4 | **`Aspect.create` runtimes thunk** | Extend `AspectOptions`. Add thunk to 5 aspects (cli, logger, status, workspace, scope). Bundler config emits chunks for them. | Lock the thunk contract early; bundler integration is risky and best tested narrow. |
| 5 | **Minimal `Harmony.resolve`** | New `resolve()` alongside `get()`. Behind a feature flag, run lazy mode for the 5 piloted aspects. Benchmarks must show wins. | First proof point that the architecture pays off. |
| 6 | **Slot-producer index** | Codegen and runtime integration. Verify `commandsSlot` works under lazy load. | Unblocks broader rollout. |
| 7 | **Bulk descriptor + thunk migration** | Codemod-driven conversion of remaining aspects. | Mechanical work, do it once the contract is solid. |
| 8 | **User extension parity** | Workspace aspect loading uses `harmony.resolve` with the same mechanism. | Removes the second code path. |
| 9 | **ESM source migration** | Phase 5 of plan §7, package by package. | Decouple from architecture changes; happens last but is parallelizable. |
| 10 | **Cleanup & finalize publish bundle** | Drop eager fallback, finalize Rollup config, write authoring docs. | Bake the contract. |

Slice 1 (the bench harness) should run first regardless of how the rest is sequenced — without baseline numbers the rest is faith-based.

## 11. Validation via prototype

A runnable prototype lives at [`prototypes/mini-bit/`](../prototypes/mini-bit/). It implements the core of this architecture in ~30 small ESM files: a Harmony with lazy `resolve()`, seven aspects (cli, logger, scope, workspace, status, install, compiler) each with a manifest / runtime / descriptor split, simulated module-load weight, and an `BIT_EAGER=1` toggle for comparison.

### 11.1 Measured behaviour (Node 18, M-class Mac, single sample)

| Command | Lazy mode | Eager mode | Aspects loaded (lazy) | Aspects skipped (lazy) |
| --- | --- | --- | --- | --- |
| `--version` | 2 ms | n/a | 1 (`cli`) | 6 |
| `--help` | 3–4 ms | n/a | 1 (`cli`) | 6 |
| unknown command | 2 ms | n/a | 1 (`cli`) | 6 |
| `status` | ~135 ms | ~298 ms | 5 (`cli`, `logger`, `scope`, `workspace`, `status`) | `install`, `compiler` |
| `install` | ~166 ms | ~298 ms | 5 (`cli`, `logger`, `scope`, `workspace`, `install`) | `status`, `compiler` |
| `compile` | ~185 ms | ~298 ms | 5 (`cli`, `logger`, `scope`, `workspace`, `compiler`) | `status`, `install` |

These are absolute numbers from a contrived demo with synthetic 35–90ms busy-loops standing in for real module-eval cost — not a forecast for production Bit. The relative pattern is what matters:

- **Fast paths stay flat regardless of total aspect count**: `--help`, `--version`, and unknown-command errors touch exactly one aspect runtime (CLI). The descriptor data needed to render help comes from `*.commands.js` files, which are imported by the static index but contain no domain code.
- **Real commands load only their transitive subtree**, not the world. `bit compile` never touches `status` or `install`.
- **Eager mode pays for everything**: even though no one asked for `compile`, the `compile` runtime is parsed and its provider runs.

### 11.2 Architectural confirmations

These were claims in the RFC; the prototype substantiates them.

- **The manifest/runtime split is implementable with one extra line per `.aspect.ts`** (the `runtimes: { main: () => import('...') }` thunk). No other source change is needed in the manifest.
- **Manifests are cheap enough to register all of them up front.** The `BitAspect` manifest transitively imports every other aspect manifest; doing so in lazy mode is essentially free (manifest files are 10-line data declarations with no domain imports). This means lazy dispatch can resolve any command name without consulting the index for "is this aspect known?" — it just calls `harmony.resolve(id)` and the manifest is already registered.
- **The same `harmony.resolve` API works uniformly for all aspects.** No special user-extension path needed; whatever code calls `loadUserAspects` simply does `harmony.registerManifest(userManifest); await harmony.resolve(userManifest.id);`. RFC §6.7's claim of "one mental model" is concrete and shippable.
- **Descriptors are inlinable.** The prototype's `command-index.generated.js` is literally a `for` loop over imported descriptor arrays. The same shape works for the publish-time generated artifact.

### 11.3 Surprises and refinements

Things that emerged while building the prototype and that revise the RFC's design:

1. **Manifest-level dependencies and runtime-level dependencies can diverge — and that's useful.**
   Today's Bit uses `Aspect.create({ dependencies: [...] })` to establish manifest ordering and `XMain.dependencies = [...]` to declare provider-injected deps. The prototype confirmed these are conceptually independent: the manifest graph is for *discovery and registration*, the runtime graph is for *DI*. The RFC should not pressure them to be identical — keeping them separate gives bundling and codegen more flexibility.

2. **No separate `core-manifests.js` is needed if `BitAspect`'s manifest already aggregates them.**
   The prototype reused the existing pattern (BitAspect declares all core aspects as `dependencies`) as the manifest registry. The entry point passes `BitAspect` to `Harmony.load(..., manifestOnly: [BitAspect])` and gets transitive manifest registration for free. RFC §5.1 and §6.5 should reflect that the registry is just `BitAspect.dependencies` — not a new file.

3. **`Harmony.load` needs a "manifests but not roots" channel.**
   Today `Harmony.load(roots)` both registers and resolves the roots. The prototype showed that lazy mode needs an explicit way to register manifests *without* resolving them. Cleanest API:

   ```ts
   Harmony.load(rootAspectsToResolve, runtimeName, config, manifestsToRegisterOnly)
   ```

   This is a tiny additive change; existing call sites are unaffected.

4. **Parallel `import()` helps less than expected on a single Node thread.**
   `Promise.all([import(a), import(b), import(c)])` does pipeline I/O, but **module top-level code (statements, class declarations, default-export evaluation) runs serially on the JS main thread**. So the dominant win comes from *skipping loads entirely*, not from parallelising them. In the prototype, `bit status` finished in ~135 ms — slightly faster than the serial sum (147 ms), but the lion's share of the win vs. eager (298 ms) is from never importing `install` or `compiler` at all.

   Implication for the RFC: §5.3 should soften the "parallel import" line. The architectural win is **subset loading**, not parallelism. Bundling (§5.2) is still worthwhile because V8 parses one large file faster than the equivalent code split across hundreds of small files — but only when the file is actually needed.

5. **Per-aspect timing is hard to attribute under parallel load.**
   The prototype's tracer reported logger's "import time" as 56 ms despite its module being empty — that's wallclock interference from sibling imports' busy-loops on the same thread, not logger's own parse cost. The PoC bench harness (§10, slice 1) should measure aspects in isolation, not nested in a real command dispatch, to get clean per-aspect numbers. Use `--cpu-prof` plus an isolated import script per aspect.

6. **Sync top-level work in `.main.runtime.ts` files is the actual cost driver.**
   In real Bit, top-level `import` chains in main-runtime files (30+ deps each for big aspects) are what's expensive — that's what we're skipping. The prototype confirms this: aspects we don't import don't pay. The corollary: **avoid putting work at module top level** in runtime files. Heavy initialization should live in the provider, where it can at least be amortized and is only paid when the aspect actually runs.

7. **`pickRuntimeExport` heuristic ("the export with a static `.provider`") works.**
   The prototype scans the dynamically imported module for a class export whose `.provider` is a function. This avoided having to mandate a specific export name (`Main`, `default`, etc.). The RFC should adopt this lenient discovery rule; it lowers migration friction.

8. **Bundling is a publish-time concern only, confirmed.**
   The prototype runs source directly under Node with no build step. The same approach works for development in real Bit (where ts-node / esbuild-loader compile on the fly). Bundling becomes valuable only when shipping the published artifact: it collapses many small chunks into a single hot path that V8 can parse and cache as one unit. Dev experience is unaffected.

9. **The command-index file is trivially small.**
   The prototype's index is 25 lines. Even with hundreds of commands, the data structure stays compact: name → `{ aspectId }`. Generation can be a 50-line script.

10. **No need for a "slots BUT lazy" hybrid at the prototype scale.**
    The prototype omitted slot machinery and the architecture still works for commands (because each command is owned by exactly one aspect; the index is sufficient). For cross-aspect slot contributions (RFC §6.6), the slot-producer index is still the right design — but it's a v2 concern, not a blocker.

### 11.4 What the prototype does NOT prove

- **Real `.main.runtime.ts` weight**. The prototype's busy-loops are toy; the win on real Bit needs to be measured against the actual 120-aspect manifest. Slice 1 of the work order (§10) is exactly this measurement.
- **Slot contributions across the lazy graph**. RFC §6.6 / §6.8 are still on the drawing board; the prototype demonstrates the simpler "command per aspect" case only.
- **Workspace-aspect lazy load with real npm resolution**. The prototype loads from relative paths; user aspects in real Bit come from `node_modules` discovery, which adds complexity (but reuses the same `harmony.resolve` shape).
- **Stack trace quality across dynamic-import chunks**. Sourcemaps need real bundler integration to validate.

### 11.5 RFC adjustments derived from the prototype

Concrete edits this section already implies:

- **§5.3 table**: keep, but soften "Parallel import()" rhetoric — emphasize *subset loading* as the primary win.
- **§5.1 diagram**: replace "core-manifests.js" with "BitAspect (reused as manifest registry)".
- **§6.5 `Harmony.resolve` sketch**: add the `manifestOnly` parameter to `Harmony.load` and document the manifest-vs-runtime registration split.
- **§6.4 `pickRuntimeExport`**: adopt the heuristic from the prototype (any export with `.provider` static method).
- **§10 slice 1 (bench harness)**: explicitly call out *per-aspect isolated measurement*, not just whole-command timing.

## 12. Appendix: file inventory of touched areas

Anchored to the code as of this RFC:

- `scopes/harmony/harmony/` — `Harmony.load`, new `resolve()`, manifest registry.
- `scopes/harmony/cli/` — `Command` interface split, `CLIMain.runResolvedCommand`, descriptor-driven yargs config.
  - `cli.main.runtime.ts:140` (`run`), `cli-parser.ts:27-63` (parse pipeline), `command-runner.ts:30-73` (handler invocation).
- `scopes/harmony/bit/` — `load-bit.ts:268-305` (new minimal bootstrap), `manifests.ts` (becomes manifest-only registry, no longer the dependency closure), new `command-index.generated.ts`.
- Every `*.aspect.ts` — add `runtimes` + `commands` thunks.
- Every `*.main.runtime.ts` that registers commands — pair with `*.commands.ts`.
- `scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts:649` — replace `require()` with `await import()`.
- `scopes/workspace/workspace/workspace.main.runtime.ts` — user-aspect loader uses unified `harmony.resolve`.

---

*End of RFC.*
