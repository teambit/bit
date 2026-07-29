import { ChangeType } from '@teambit/lanes.entities.lane-diff';

/**
 * The two sides of a change, as read from `Version.toObject()` plus the model-level
 * `extensionDependencies.cloneAsString()` (which is NOT part of the plain object). Deliberately a
 * loose shape: the classifier only reads a fixed set of fields and compares them order-insensitively.
 */
export type VersionChangeSide = {
  /** `Version.toObject()` — files, mainFile, dependencies, extensions, overrides, package deps. */
  obj: Record<string, any>;
  /** `version.extensionDependencies.cloneAsString()` — aspect/env-provided deps, not in `obj`. */
  extensionDependencies: unknown;
};

/**
 * Recursively canonicalize a value into a stable string signature: object keys sorted, array
 * elements sorted by their serialized form. Dependency lists and config maps are semantically
 * unordered (two snaps can store the same set in a different order — they aren't sorted at snap
 * time), so a pure reorder must compare EQUAL and not be misclassified as a change.
 */
function canonical(value: unknown): string {
  const norm = (v: any): any => {
    if (Array.isArray(v)) return v.map(norm).sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1));
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, any>>((acc, k) => {
          acc[k] = norm(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(norm(value) ?? null);
}

function differsUnordered(a: unknown, b: unknown): boolean {
  return canonical(a) !== canonical(b);
}

function differs(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/**
 * Classify what changed between two component versions into `ChangeType`s — the pure core of the
 * lane-diff change derivation, comparing raw `Version` shapes directly (files-by-hash, deps,
 * extensions) rather than loading full consumer components.
 *
 * Invariants relied on downstream:
 * - always returns at least one element (`[ChangeType.NONE]` when nothing changed), never `[]`.
 * - `DEPENDENCY` and `ASPECTS` are INDEPENDENT: a dependency-only change is `[DEPENDENCY]`, never
 *   also `[ASPECTS]`. The UI's Config view keys on `ASPECTS`, so conflating them put dep-only
 *   components into Config with an empty config panel.
 *
 * The API change type is intentionally NOT computed here: it needs serial tsserver schema
 * extraction and is resolved lazily by the API view, gated on the SOURCE_CODE/DEPENDENCY evidence.
 */
export function classifyVersionChanges(base: VersionChangeSide, compare: VersionChangeSide): ChangeType[] {
  const baseObj = base.obj;
  const compareObj = compare.obj;

  // `files` is a set keyed by path+hash, emitted unsorted — compare order-insensitively so a pure
  // reorder isn't a SOURCE_CODE change. `mainFile` is a single value, so ordered compare is fine.
  const hasCodeChanges =
    differsUnordered(baseObj.files, compareObj.files) || differs(baseObj.mainFile, compareObj.mainFile);

  // DEPENDENCY covers every dependency-shaped field: component deps (dependencies/devDependencies),
  // aspect/env-provided deps (extensionDependencies), and package deps (prod/dev/peer).
  const hasDepChanges =
    differsUnordered(baseObj.dependencies, compareObj.dependencies) ||
    differsUnordered(baseObj.devDependencies, compareObj.devDependencies) ||
    differsUnordered(baseObj.packageDependencies, compareObj.packageDependencies) ||
    differsUnordered(baseObj.devPackageDependencies, compareObj.devPackageDependencies) ||
    differsUnordered(baseObj.peerPackageDependencies, compareObj.peerPackageDependencies) ||
    differsUnordered(base.extensionDependencies, compare.extensionDependencies);

  // ASPECTS means the component's CONFIG changed (aspects/extensions, overrides) — deliberately NOT
  // a superset of dependency changes.
  const hasAspectConfigChanges =
    differsUnordered(baseObj.extensions, compareObj.extensions) ||
    differsUnordered(baseObj.overrides, compareObj.overrides);

  if (!hasCodeChanges && !hasDepChanges && !hasAspectConfigChanges) {
    return [ChangeType.NONE];
  }

  const changed: ChangeType[] = [];
  if (hasCodeChanges) changed.push(ChangeType.SOURCE_CODE);
  if (hasAspectConfigChanges) changed.push(ChangeType.ASPECTS);
  if (hasDepChanges) changed.push(ChangeType.DEPENDENCY);

  return changed;
}
