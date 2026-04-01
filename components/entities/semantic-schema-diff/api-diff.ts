import type { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { deepEqualNoLocation as deepEqual } from '@teambit/semantics.entities.semantic-schema';
import type { APIDiffResult, APIDiffChange } from './api-diff-change';
import { APIDiffStatus } from './api-diff-change';
import type { ImpactLevel } from './impact-rule';
import type { ImpactAssessor, AssessedChange } from './impact-assessor';
import { worstImpact } from './impact-assessor';
import { buildExportMap, buildInternalMap, getSchemaTypeName, getDisplayName, toComparableObject } from './utils';

function diffExports(
  baseExports: ReturnType<typeof buildExportMap>,
  compareExports: ReturnType<typeof buildExportMap>,
  visibility: 'public' | 'internal',
  assessor: ImpactAssessor
): APIDiffChange[] {
  const allNames = new Set([...baseExports.keys(), ...compareExports.keys()]);
  const changes: APIDiffChange[] = [];

  for (const name of allNames) {
    const baseEntry = baseExports.get(name);
    const compareEntry = compareExports.get(name);

    if (!baseEntry && compareEntry) {
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
        const facts = baseEntry.unwrapped.diff(compareEntry.unwrapped);
        const assessed: AssessedChange[] = assessor.assess(facts);
        const impact = assessed.length > 0 ? worstImpact(assessed) : 'PATCH';

        const baseSig = baseEntry.unwrapped.signature;
        const compareSig = compareEntry.unwrapped.signature;
        // Only include signatures when they actually differ — stale artifact
        // signatures can be identical even when the structured data changed.
        const sigsDiffer = baseSig !== compareSig;

        changes.push({
          status: APIDiffStatus.MODIFIED,
          visibility,
          exportName: name,
          schemaType: getDisplayName(compareEntry.unwrapped, true),
          schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
          impact,
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

export function computeAPIDiff(base: APISchema, compare: APISchema, assessor: ImpactAssessor): APIDiffResult {
  const baseExports = buildExportMap(base.module.exports);
  const compareExports = buildExportMap(compare.module.exports);

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

  const publicChanges = [...visibilityChanges, ...diffExports(baseExports, compareExports, 'public', assessor)];
  const internalChanges = diffExports(baseInternals, compareInternals, 'internal', assessor);

  const allChanges = [...publicChanges, ...internalChanges];

  const added = allChanges.filter((c) => c.status === APIDiffStatus.ADDED).length;
  const removed = allChanges.filter((c) => c.status === APIDiffStatus.REMOVED).length;
  const modified = allChanges.filter((c) => c.status === APIDiffStatus.MODIFIED).length;
  const breaking = allChanges.filter((c) => c.impact === 'BREAKING').length;
  const nonBreaking = allChanges.filter((c) => c.impact === 'NON_BREAKING').length;
  const patch = allChanges.filter((c) => c.impact === 'PATCH').length;

  const impact: ImpactLevel = allChanges.length > 0 ? worstImpact(allChanges) : 'PATCH';

  return {
    hasChanges: allChanges.length > 0,
    impact,
    publicChanges,
    internalChanges,
    changes: allChanges,
    added,
    removed,
    modified,
    breaking,
    nonBreaking,
    patch,
  };
}
