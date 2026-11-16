import mapSeries from 'p-map-series';
import multimatch from 'multimatch';
import { partition } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { NoIdMatchPattern } from './exceptions/no-id-match-pattern';

export type FilterByStateFunc = (state: string, poolIds: ComponentID[]) => Promise<ComponentID[]>;

/**
 * filter the given ids by a pattern. see "bit pattern --help" for the syntax.
 * a state (e.g. "$modified") can be negated with "!" (e.g. "!$modified"), also inside an " AND " pattern.
 */
export async function filterIdsByPattern(
  pattern: string,
  ids: ComponentID[],
  throwForNoMatch = true,
  filterByStateFunc?: FilterByStateFunc
): Promise<ComponentID[]> {
  const allPatterns = pattern.split(',').map((p) => p.trim());
  // an " AND " expression is evaluated as a whole, even when its first clause is negated
  const isExclusion = (p: string) => p.startsWith('!') && !p.includes(' AND ');
  if (allPatterns.every(isExclusion)) {
    // otherwise it'll never match anything. don't use ".push()". it must be the first item in the array.
    allPatterns.unshift('**');
  }
  const filterByState = (statePattern: string, poolIds: ComponentID[]) => {
    if (!filterByStateFunc) {
      throw new Error(`filter by a state (${statePattern}) is currently supported on the workspace only`);
    }
    return filterByStateFunc(statePattern.replace('$', ''), poolIds);
  };
  const excludeByState = async (negatedStatePattern: string, poolIds: ComponentID[]) => {
    const excluded = await filterByState(negatedStatePattern.slice(1), poolIds);
    const excludedStr = new Set(excluded.map((id) => id.toStringWithoutVersion()));
    return poolIds.filter((id) => !excludedStr.has(id.toStringWithoutVersion()));
  };
  const filterByAndPattern = async (andPattern: string) => {
    // check also as legacyId.toString, as it doesn't have the defaultScope
    const matchesGlob = (id: ComponentID, glob: string) =>
      multimatch([id._legacy.toStringWithoutVersion(), id.toStringWithoutVersion()], [glob.split('@')[0]]).length > 0;
    let filtered = ids;
    for (const clause of andPattern.split(' AND ').map((p) => p.trim())) {
      if (clause.startsWith('!$')) filtered = await excludeByState(clause, filtered);
      else if (clause.startsWith('!')) filtered = filtered.filter((id) => !matchesGlob(id, clause.slice(1)));
      else if (clause.startsWith('$')) filtered = await filterByState(clause, filtered);
      else filtered = filtered.filter((id) => matchesGlob(id, clause));
    }
    return filtered;
  };

  const [negatedStatePatterns, patterns] = partition(allPatterns, (p) => p.startsWith('!$') && !p.includes(' AND '));
  const [statePatterns, nonStatePatterns] = partition(patterns, (p) => p.startsWith('$') || p.includes(' AND '));
  const nonStatePatternsNoVer = nonStatePatterns.map((p) => p.split('@')[0]); // no need for the version
  const idsMap: { [id: string]: ComponentID } = Object.fromEntries(ids.map((id) => [id.toStringWithoutVersion(), id]));
  const idsFiltered = multimatch(Object.keys(idsMap), nonStatePatternsNoVer).map((idStr) => idsMap[idStr]);
  const idsStateFiltered = await mapSeries(statePatterns, (statePattern) =>
    statePattern.includes(' AND ') ? filterByAndPattern(statePattern) : filterByState(statePattern, ids)
  );
  let allIdsFiltered: ComponentID[] = ComponentIdList.uniqFromArray([...idsFiltered, ...idsStateFiltered.flat()]);
  for (const negatedStatePattern of negatedStatePatterns) {
    allIdsFiltered = await excludeByState(negatedStatePattern, allIdsFiltered);
  }
  if (throwForNoMatch && !allIdsFiltered.length) {
    throw new NoIdMatchPattern(pattern);
  }
  return allIdsFiltered;
}
