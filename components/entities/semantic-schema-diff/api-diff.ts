import type { APISchema } from '@teambit/semantics.entities.semantic-schema';
import type { APIDiffResult, APIDiffChange } from './api-diff-change';
import { APIDiffStatus, SemanticImpact } from './api-diff-change';
import { buildExportMap, getSchemaTypeName, getDisplayName, toComparableObject } from './utils';
import { deepEqualNoLocation as deepEqual } from '@teambit/semantics.entities.semantic-schema';
import { computeDetailedDiff } from './schema-comparators';

function worstImpact(details: { impact: SemanticImpact }[]): SemanticImpact {
  if (details.some((d) => d.impact === SemanticImpact.BREAKING)) return SemanticImpact.BREAKING;
  if (details.some((d) => d.impact === SemanticImpact.NON_BREAKING)) return SemanticImpact.NON_BREAKING;
  return SemanticImpact.PATCH;
}

function diffExports(
  baseExports: ReturnType<typeof buildExportMap>,
  compareExports: ReturnType<typeof buildExportMap>,
  visibility: 'public' | 'internal'
): APIDiffChange[] {
  const allNames = new Set([...baseExports.keys(), ...compareExports.keys()]);
  const changes: APIDiffChange[] = [];

  for (const name of allNames) {
    const baseEntry = baseExports.get(name);
    const compareEntry = compareExports.get(name);

    if (!baseEntry && compareEntry) {
      changes.push({
        status: APIDiffStatus.ADDED,
        visibility,
        exportName: name,
        schemaType: getDisplayName(compareEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
        impact: SemanticImpact.NON_BREAKING,
        compareSignature: compareEntry.unwrapped.signature,
        compareNode: compareEntry.unwrapped.toObject(),
      });
    } else if (baseEntry && !compareEntry) {
      changes.push({
        status: APIDiffStatus.REMOVED,
        visibility,
        exportName: name,
        schemaType: getDisplayName(baseEntry.unwrapped, true),
        schemaTypeRaw: getSchemaTypeName(baseEntry.unwrapped),
        impact: visibility === 'public' ? SemanticImpact.BREAKING : SemanticImpact.PATCH,
        baseSignature: baseEntry.unwrapped.signature,
        baseNode: baseEntry.unwrapped.toObject(),
      });
    } else if (baseEntry && compareEntry) {
      const baseComparable = toComparableObject(baseEntry.unwrapped);
      const compareComparable = toComparableObject(compareEntry.unwrapped);

      if (!deepEqual(baseComparable, compareComparable)) {
        const details = computeDetailedDiff(baseEntry.unwrapped, compareEntry.unwrapped);
        const impact = details.length > 0 ? worstImpact(details) : SemanticImpact.PATCH;
        changes.push({
          status: APIDiffStatus.MODIFIED,
          visibility,
          exportName: name,
          schemaType: getDisplayName(compareEntry.unwrapped, true),
          schemaTypeRaw: getSchemaTypeName(compareEntry.unwrapped),
          impact,
          baseSignature: baseEntry.unwrapped.signature,
          compareSignature: compareEntry.unwrapped.signature,
          baseNode: baseEntry.unwrapped.toObject(),
          compareNode: compareEntry.unwrapped.toObject(),
          changes: details,
        });
      }
    }
  }

  return changes;
}

/**
 * Build a name-keyed map from a list of internal modules.
 * Internal modules have a filePath-based identity.
 */
function buildInternalMap(internals: any[]): ReturnType<typeof buildExportMap> {
  const map = new Map<string, { name: string; node: any; unwrapped: any }>();
  for (const mod of internals) {
    const exports = mod.exports || [];
    for (const exp of exports) {
      const name = exp.alias || exp.name || exp.exportNode?.name || '';
      const unwrapped = exp.exportNode || exp;
      if (name) {
        const qualifiedName = mod.namespace ? `${mod.namespace}/${name}` : name;
        map.set(qualifiedName, { name: qualifiedName, node: exp, unwrapped });
      }
    }
  }
  return map;
}

/**
 * Compute a semantic diff between two APISchema objects.
 *
 * Produces:
 * - Public API changes (exports from the module index)
 * - Internal changes (non-exported modules)
 * - Semantic impact classification (BREAKING / NON_BREAKING / PATCH)
 * - Detailed sub-changes per export
 */
export function computeAPIDiff(base: APISchema, compare: APISchema): APIDiffResult {
  // Public exports
  const baseExports = buildExportMap(base.module.exports);
  const compareExports = buildExportMap(compare.module.exports);
  const publicChanges = diffExports(baseExports, compareExports, 'public');

  // Internal modules
  const baseInternals = buildInternalMap(base.internals || []);
  const compareInternals = buildInternalMap(compare.internals || []);
  const internalChanges = diffExports(baseInternals, compareInternals, 'internal');

  const allChanges = [...publicChanges, ...internalChanges];

  const added = allChanges.filter((c) => c.status === APIDiffStatus.ADDED).length;
  const removed = allChanges.filter((c) => c.status === APIDiffStatus.REMOVED).length;
  const modified = allChanges.filter((c) => c.status === APIDiffStatus.MODIFIED).length;
  const breaking = allChanges.filter((c) => c.impact === SemanticImpact.BREAKING).length;
  const nonBreaking = allChanges.filter((c) => c.impact === SemanticImpact.NON_BREAKING).length;
  const patch = allChanges.filter((c) => c.impact === SemanticImpact.PATCH).length;

  const impact = allChanges.length > 0 ? worstImpact(allChanges) : SemanticImpact.PATCH;

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
