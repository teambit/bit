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
