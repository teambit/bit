import type { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { deepEqualNoLocation as deepEqual } from '@teambit/semantics.entities.semantic-schema';
import type { APIDiffResult, APIDiffChange } from './api-diff-change';
import { APIDiffStatus } from './api-diff-change';
import type { ImpactLevel } from './impact-rule';
import type { ImpactAssessor, AssessedChange } from './impact-assessor';
import { buildExportMap, getSchemaTypeName, getDisplayName, toComparableObject } from './utils';

function worstImpact(items: { impact: ImpactLevel }[]): ImpactLevel {
  if (items.some((d) => d.impact === 'BREAKING')) return 'BREAKING';
  if (items.some((d) => d.impact === 'NON_BREAKING')) return 'NON_BREAKING';
  return 'PATCH';
}

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
      // ADDED — assess a synthetic fact for the addition itself
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
      // REMOVED
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
        // Get neutral facts from schema node diff
        const facts = baseEntry.unwrapped.diff(compareEntry.unwrapped);
        // Assess impact for each fact
        const assessed: AssessedChange[] = assessor.assess(facts);
        const impact = assessed.length > 0 ? worstImpact(assessed) : 'PATCH';

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
          changes: assessed,
        });
      }
    }
  }

  return changes;
}

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
 * Schema nodes produce neutral change facts via `diff()`.
 * The ImpactAssessor maps those facts to impact levels (BREAKING/NON_BREAKING/PATCH)
 * using registerable rules.
 */
export function computeAPIDiff(base: APISchema, compare: APISchema, assessor: ImpactAssessor): APIDiffResult {
  const baseExports = buildExportMap(base.module.exports);
  const compareExports = buildExportMap(compare.module.exports);
  const publicChanges = diffExports(baseExports, compareExports, 'public', assessor);

  const baseInternals = buildInternalMap(base.internals || []);
  const compareInternals = buildInternalMap(compare.internals || []);
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
