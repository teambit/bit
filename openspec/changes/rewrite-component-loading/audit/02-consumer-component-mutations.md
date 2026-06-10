# Audit 1.2 — Post-load mutations on `ConsumerComponent` and harmony `Component`

**Goal:** find every site that mutates a loaded component instance after the loader returns it. These are the migration risks: the rewrite eliminates the in-place legacy/harmony bridge mutation (`workspace-component-loader.ts:813`), and downstream code that relies on similar mutations needs to be ported.

Excluded from this audit: constructors (`new ConsumerComponent(...)`, `new Version(...)`), test helpers, and the `AddedComponent` type used by the tracker (which is not a loaded component).

## Mutation sites

### Critical — eliminated by the rewrite itself

**`scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:813`** — `consumerComponent.extensions = extensions;`

- This is the legacy/harmony bridge mutation: after the harmony loader resolves extensions, it writes them back onto the legacy `ConsumerComponent`. The rewrite removes this site entirely (the harmony `Component` becomes the source of truth).
- **Migration:** vanishes when `WorkspaceComponentLoader` is deleted (task 9.1).

### Snapping/tagging — must migrate

**`scopes/component/snapping/snapping.main.runtime.ts:351`** — `consumerComponent.extensions = extensionDataList;`

- During snap/tag, after re-deriving extensions from configs, the new `extensionDataList` is restored onto the legacy component (preserving original `data` fields on each extension first, lines 344–349).
- The very next line (`352`) sets `component.state.aspects` on the harmony component — they're already kept in sync but via two separate writes.
- **Migration:** rewrite as a single write to the harmony `Component` (a method like `component.replaceExtensions(list, { preserveDataFromOriginal: true })`). The legacy view (`component.asLegacy()`) reflects this automatically.

**`scopes/component/snapping/snapping.main.runtime.ts:1108`** — `version.extensions = consumerComponent.extensions;`

- Mutates a `Version` model object during snap, copying extensions from the consumer. This is on the **scope-objects model**, not a loaded component — but it depends on the consumer being mutated by site 351 first.
- **Migration:** same as 351 — once the harmony `Component` is the source of truth, copy extensions from the harmony `Component` directly. Order-of-operations becomes: snap derives extensions → harmony Component is updated → Version model is built from it.

**`scopes/component/snapping/version-maker.ts:524`** — `component.extensions = component.extensions.clone();`

- `emptyBuilderData()`: clones the extensions list and zeros the `builder` extension's `data` so that the next tag/snap doesn't carry stale build artifacts. The variable `component` is **harmony**, not legacy — but the mutation pattern still violates the "phases are additive" invariant of the new model (mutating the extensions of a loaded component changes its `extensions`-phase data).
- **Migration:** introduce `component.withBuilderDataReset()` returning a new component, or move this reset into the snap pipeline as a derived value rather than a mutation.

### Checkout/merge/import — file mutations

**`scopes/component/checkout/checkout-version.ts:89`** — `component.files = modifiedFiles;`

- Checkout merges files between the workspace version and the target version, then writes the merged file list back to the consumer.
- **Migration:** this is post-load mutation that produces the new on-disk state. After the rewrite, the canonical write goes through the file system + `componentLoader.invalidate(id)`; the in-memory mutation becomes unnecessary because the next `loader.get(id, { phase: 'files' })` re-reads from disk.

**`scopes/component/merging/merging.main.runtime.ts:529`** — `legacyComponent.version = id.version;`
**`scopes/component/merging/merging.main.runtime.ts:537`** — `legacyComponent.files = modifiedFiles;`

- Same pattern as checkout: merge writes the new file list and the new version onto the legacy component.
- **Migration:** same as checkout — write to disk, invalidate, reload at the requested phase.

**`scopes/scope/importer/import-components.ts:906`** — `component.files = modifiedFiles;`

- During import three-way merge, the merged file list is written onto the loaded consumer component before being persisted.
- **Migration:** same — write to disk, invalidate, reload.

**`scopes/component/snapping/generate-comp-from-scope.ts:78`** — `consumerComponent.version = version.hash().toString();`

- Synthesizes a snap-from-scope component (no workspace) and assigns the version after the Version object is computed.
- **Migration:** this is a synthesis-from-scope flow, not a workspace load. It can keep the mutation pattern locally because the consumer here is constructed inside the function, never returned to the loader cache. Document as "permitted local mutation, not a loader-cache concern."

## Summary

| Site                                | Category                         | Migration                            |
| ----------------------------------- | -------------------------------- | ------------------------------------ |
| `workspace-component-loader.ts:813` | bridge mutation                  | deleted with the file (task 9.1)     |
| `snapping.main.runtime.ts:351`      | extensions re-derive             | port to harmony method, single write |
| `snapping.main.runtime.ts:1108`     | version-model copy from consumer | derive from harmony, no consumer hop |
| `version-maker.ts:524`              | builder data reset               | derived value or new method          |
| `checkout-version.ts:89`            | post-merge file write            | write→invalidate→reload              |
| `merging.main.runtime.ts:529`       | post-merge version write         | write→invalidate→reload              |
| `merging.main.runtime.ts:537`       | post-merge file write            | write→invalidate→reload              |
| `import-components.ts:906`          | post-merge file write            | write→invalidate→reload              |
| `generate-comp-from-scope.ts:78`    | synthesis-only                   | keep (local construction)            |

## Notes

- The "write→invalidate→reload" pattern is the same operation expressed without state coupling. With phased lazy hydration, reload cost is bounded by the requested phase — typically `files`, which is cheap.
- The snapping mutations are the most coupled: extensions, version, and aspects are all mutated together. Keep them grouped during migration so that the harmony equivalent is a single atomic update.
- No mutation of `dependencies` / `devDependencies` / `peerDependencies` was found post-load — those are computed and read but not assigned to the loaded component instance.
