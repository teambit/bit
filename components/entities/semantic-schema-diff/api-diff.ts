import type { APISchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { deepEqualNoLocation as deepEqual } from '@teambit/semantics.entities.semantic-schema';
import type { APIDiffResult, APIDiffChange, SchemaAvailability, APIDiffComputeStatus } from './api-diff-change';
import { APIDiffStatus } from './api-diff-change';
import type { ImpactLevel } from './impact-rule';
import type { ImpactAssessor, AssessedChange } from './impact-assessor';
import { worstImpact } from './impact-assessor';
import {
  buildExportMap,
  buildInternalMap,
  getSchemaTypeName,
  getDisplayName,
  getExportName,
  unwrapExport,
  toComparableObject,
} from './utils';

/**
 * Names of exports the extractor couldn't resolve on a side — it produced an `UnImplementedSchema`
 * placeholder (no signature, no structure) rather than a real schema node. These are extraction gaps,
 * not API surface, and must never be diffed as added/removed/modified. We collect them so the diff can
 * (a) suppress the phantom add/remove they'd otherwise cause and (b) surface them as a distinct
 * "couldn't analyze" state instead of a meaningful change.
 */
function collectUnresolvedNames(exports: SchemaNode[]): Set<string> {
  const names = new Set<string>();
  for (const exp of exports) {
    if (getSchemaTypeName(unwrapExport(exp)) === 'UnImplementedSchema') {
      const name = getExportName(exp);
      if (name) names.add(name);
    }
  }
  return names;
}

function diffExports(
  baseExports: ReturnType<typeof buildExportMap>,
  compareExports: ReturnType<typeof buildExportMap>,
  visibility: 'public' | 'internal',
  assessor: ImpactAssessor,
  unresolved?: { base: Set<string>; compare: Set<string>; out: Set<string> }
): APIDiffChange[] {
  const allNames = new Set([...baseExports.keys(), ...compareExports.keys()]);
  const changes: APIDiffChange[] = [];

  for (const name of allNames) {
    const baseEntry = baseExports.get(name);
    const compareEntry = compareExports.get(name);

    if (!baseEntry && compareEntry) {
      // Present in compare, absent from base — but if base had it as an unresolved placeholder it
      // existed there too; this is an extraction gap, not a new export. Surface it, don't add it.
      if (unresolved?.base.has(name)) {
        unresolved.out.add(name);
        continue;
      }
      const addedImpact = assessor.assessFact({
        changeKind: 'export-added',
        description: `export '${name}' added`,
        context: { exportName: name, visibility },
      });
      changes.push({
        status: APIDiffStatus.ADDED,
        visibility,
        exportName: name,
        schemaType: getDisplayName(compareEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
        impact: addedImpact,
        compareSignature: compareEntry.unwrapped.signature,
        compareNode: compareEntry.unwrapped.toObject(),
      });
    } else if (baseEntry && !compareEntry) {
      // Absent from compare — but if compare has it as an unresolved placeholder it's still there,
      // just un-analyzable. Not a removal; surface as "couldn't analyze" instead of a phantom remove.
      if (unresolved?.compare.has(name)) {
        unresolved.out.add(name);
        continue;
      }
      const removedImpact = assessor.assessFact({
        changeKind: 'export-removed',
        description: `export '${name}' removed`,
        context: { exportName: name, visibility, isPublic: visibility === 'public' },
      });
      changes.push({
        status: APIDiffStatus.REMOVED,
        visibility,
        exportName: name,
        schemaType: getDisplayName(baseEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(baseEntry.unwrapped),
        impact: removedImpact,
        baseSignature: baseEntry.unwrapped.signature,
        baseNode: baseEntry.unwrapped.toObject(),
      });
    } else if (baseEntry && compareEntry) {
      const baseComparable = toComparableObject(baseEntry.unwrapped);
      const compareComparable = toComparableObject(compareEntry.unwrapped);

      if (!deepEqual(baseComparable, compareComparable)) {
        // Drop facts whose rendered `from`/`to` are identical. The deep compare catches non-semantic
        // differences (resolved-type internals, member ordering, build artifacts) that don't change
        // the visible API — they'd otherwise surface as "X changed" rows with no actual diff, the bulk
        // of the noise after an env/build change. A real change always renders a different from/to.
        const facts = (baseEntry.unwrapped.diff?.(compareEntry.unwrapped) ?? []).filter(
          (f) => !(f.from != null && f.to != null && f.from === f.to)
        );
        const assessed: AssessedChange[] = assessor.assess(facts);

        const baseSig = baseEntry.unwrapped.signature;
        const compareSig = compareEntry.unwrapped.signature;
        // require both signatures: a null on one side is missing extraction data, not a real change.
        // without this guard a real signature vs. `undefined` reads as "differ", so an export with no
        // actual change is emitted as MODIFIED (empty block) instead of being skipped below.
        const sigsDiffer = Boolean(baseSig && compareSig && baseSig !== compareSig);

        // Skip if no semantic changes detected — the structural difference is
        // just metadata (locations, ordering) that doesn't affect the API.
        if (assessed.length === 0 && !sigsDiffer) continue;

        const impact = assessed.length > 0 ? worstImpact(assessed) : 'PATCH';

        changes.push({
          status: APIDiffStatus.MODIFIED,
          visibility,
          exportName: name,
          schemaType: getDisplayName(compareEntry.unwrapped, true),
          schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
          impact,
          // Only include signatures when they actually differ — stale artifact
          // signatures can be identical even when the structured data changed.
          baseSignature: sigsDiffer ? baseSig : undefined,
          compareSignature: sigsDiffer ? compareSig : undefined,
          baseNode: baseEntry.unwrapped.toObject(),
          compareNode: compareEntry.unwrapped.toObject(),
          changes: assessed,
        });
      }
    }
  }

  return changes;
}

/**
 * Remove entries from an internal map that also appear in the public export map.
 * Older schema extractors duplicated public exports into `internals` — we filter
 * those out so the diff doesn't report phantom additions/removals.
 */
function dedupeInternals(
  internals: ReturnType<typeof buildExportMap>,
  publicExports: ReturnType<typeof buildExportMap>
): ReturnType<typeof buildExportMap> {
  const deduped = new Map(internals);
  for (const name of deduped.keys()) {
    if (publicExports.has(name)) deduped.delete(name);
  }
  return deduped;
}

/**
 * Drop exports that are bare re-references (a `TypeRefSchema`) to a symbol already exported under its
 * own name in the same module — e.g. `export default Foo` where `Foo` is also a named export. Such an
 * alias adds no independent API surface, and extractors represent it inconsistently across builds
 * (an unresolved default one build, a `Foo (default)` type-ref alias the next). Left in, that
 * inconsistency surfaces as a phantom added/removed export on an otherwise unrelated (e.g. docs-only)
 * change. Mirrors `dedupeInternals` — remove the redundant entry so the diff sees only real surface.
 */
function dedupeReexportAliases(exports: ReturnType<typeof buildExportMap>): ReturnType<typeof buildExportMap> {
  for (const [key, entry] of exports) {
    const target = (entry.unwrapped as any)?.name;
    if (getSchemaTypeName(entry.unwrapped) === 'TypeRefSchema' && target && target !== key && exports.has(target)) {
      exports.delete(key);
    }
  }
  return exports;
}

/**
 * Detect symbols that moved between public and internal across versions.
 * Returns the visibility change entries and mutates the maps to remove the
 * moved symbols so they don't appear as separate add/remove pairs.
 */
function detectVisibilityChanges(
  baseExports: ReturnType<typeof buildExportMap>,
  compareExports: ReturnType<typeof buildExportMap>,
  baseInternals: ReturnType<typeof buildExportMap>,
  compareInternals: ReturnType<typeof buildExportMap>,
  assessor: ImpactAssessor
): APIDiffChange[] {
  const changes: APIDiffChange[] = [];

  // public → internal (made protected): breaking for consumers
  for (const name of baseExports.keys()) {
    if (!compareExports.has(name) && compareInternals.has(name)) {
      const baseEntry = baseExports.get(name)!;
      const compareEntry = compareInternals.get(name)!;
      const impact = assessor.assessFact({
        changeKind: 'visibility-public-to-internal',
        description: `'${name}' moved from public API to internal — consumers can no longer import it`,
        context: { exportName: name, from: 'public', to: 'internal' },
      });
      changes.push({
        status: APIDiffStatus.MODIFIED,
        visibility: 'public',
        exportName: name,
        schemaType: getDisplayName(baseEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(baseEntry.unwrapped),
        impact,
        baseSignature: baseEntry.unwrapped.signature,
        compareSignature: compareEntry.unwrapped.signature,
        changes: [
          {
            changeKind: 'visibility-public-to-internal',
            description: `moved from public API to internal`,
            impact,
            context: {},
          },
        ],
      });
      baseExports.delete(name);
      compareInternals.delete(name);
    }
  }

  // internal → public (made public): non-breaking, new API surface
  for (const name of baseInternals.keys()) {
    if (!compareInternals.has(name) && compareExports.has(name)) {
      const baseEntry = baseInternals.get(name)!;
      const compareEntry = compareExports.get(name)!;
      const impact = assessor.assessFact({
        changeKind: 'visibility-internal-to-public',
        description: `'${name}' promoted from internal to public API`,
        context: { exportName: name, from: 'internal', to: 'public' },
      });
      changes.push({
        status: APIDiffStatus.MODIFIED,
        visibility: 'public',
        exportName: name,
        schemaType: getDisplayName(compareEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
        impact,
        baseSignature: baseEntry.unwrapped.signature,
        compareSignature: compareEntry.unwrapped.signature,
        changes: [
          {
            changeKind: 'visibility-internal-to-public',
            description: `promoted from internal to public API`,
            impact,
            context: {},
          },
        ],
      });
      baseInternals.delete(name);
      compareExports.delete(name);
    }
  }

  return changes;
}

export type APIDiffAvailability = {
  base: SchemaAvailability;
  compare: SchemaAvailability;
};

const AVAILABLE: SchemaAvailability = { available: true };

function emptyResult(status: APIDiffComputeStatus, availability: APIDiffAvailability): APIDiffResult {
  return {
    status,
    base: availability.base,
    compare: availability.compare,
    hasChanges: false,
    impact: 'PATCH',
    internalImpact: 'PATCH',
    publicChanges: [],
    internalChanges: [],
    changes: [],
    unresolvedExports: [],
    added: 0,
    removed: 0,
    modified: 0,
    breaking: 0,
    nonBreaking: 0,
    patch: 0,
  };
}

export function computeAPIDiff(
  base: APISchema,
  compare: APISchema,
  assessor: ImpactAssessor,
  availability: APIDiffAvailability = { base: AVAILABLE, compare: AVAILABLE }
): APIDiffResult {
  // A missing schema must never be diffed as if it were an empty API — one empty side
  // would report the entire surface as added/removed, and two empty sides would be
  // indistinguishable from "no changes". Short-circuit with an explicit status instead.
  if (!availability.base.available || !availability.compare.available) {
    const status: APIDiffComputeStatus =
      !availability.base.available && !availability.compare.available
        ? 'UNAVAILABLE'
        : !availability.base.available
          ? 'BASE_UNAVAILABLE'
          : 'COMPARE_UNAVAILABLE';
    return emptyResult(status, availability);
  }

  const baseExports = dedupeReexportAliases(buildExportMap(base.module.exports));
  const compareExports = dedupeReexportAliases(buildExportMap(compare.module.exports));

  // Exports the extractor couldn't resolve on either side. Tracked so their absence on the other side
  // isn't mistaken for an add/remove, and so they can be surfaced as "couldn't analyze" (a `TypeRef`
  // that resolves to a present export is already handled by dedupeReexportAliases above).
  const unresolved = {
    base: collectUnresolvedNames(base.module.exports),
    compare: collectUnresolvedNames(compare.module.exports),
    out: new Set<string>(),
  };

  const baseInternals = dedupeInternals(buildInternalMap(base.internals || []), baseExports);
  const compareInternals = dedupeInternals(buildInternalMap(compare.internals || []), compareExports);

  // Detect cross-boundary visibility changes before diffing each group
  const visibilityChanges = detectVisibilityChanges(
    baseExports,
    compareExports,
    baseInternals,
    compareInternals,
    assessor
  );

  const publicChanges = [
    ...visibilityChanges,
    ...diffExports(baseExports, compareExports, 'public', assessor, unresolved),
  ];
  const internalChanges = diffExports(baseInternals, compareInternals, 'internal', assessor);

  // Names unresolved on BOTH sides that never surfaced as a resolved export — the export exists but is
  // opaque to extraction in both versions. (Names resolved on at least one side are not "unresolved".)
  for (const name of unresolved.base) {
    if (unresolved.compare.has(name) && !baseExports.has(name) && !compareExports.has(name)) {
      unresolved.out.add(name);
    }
  }
  const unresolvedExports = [...unresolved.out];

  const allChanges = [...publicChanges, ...internalChanges];

  const counts = { added: 0, removed: 0, modified: 0, breaking: 0, nonBreaking: 0, patch: 0 };
  for (const c of allChanges) {
    if (c.status === APIDiffStatus.ADDED) counts.added++;
    else if (c.status === APIDiffStatus.REMOVED) counts.removed++;
    else if (c.status === APIDiffStatus.MODIFIED) counts.modified++;
    if (c.impact === 'BREAKING') counts.breaking++;
    else if (c.impact === 'NON_BREAKING') counts.nonBreaking++;
    else if (c.impact === 'PATCH') counts.patch++;
  }

  // Consumer-facing impact comes from public changes only — an internal-only refactor
  // must not stamp the component MAJOR. Internal severity is reported separately.
  const impact: ImpactLevel = publicChanges.length > 0 ? worstImpact(publicChanges) : 'PATCH';
  const internalImpact: ImpactLevel = internalChanges.length > 0 ? worstImpact(internalChanges) : 'PATCH';

  return {
    status: 'COMPUTED',
    base: availability.base,
    compare: availability.compare,
    hasChanges: allChanges.length > 0,
    impact,
    internalImpact,
    publicChanges,
    internalChanges,
    changes: allChanges,
    unresolvedExports,
    ...counts,
  };
}
