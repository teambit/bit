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

  if (allPatterns.every((p) => p.startsWith('!'))) {
    // otherwise it'll never match anything. don't use ".push()". it must be the first item in the array.
    allPatterns.unshift('**');
  }
  const getFilterByStateFunc = (statePattern: string) => {
    if (!filterByStateFunc) {
      throw new Error(`filter by a state (${statePattern}) is currently supported on the workspace only`);
    }
    return filterByStateFunc;
  };
  const filterByState = (statePattern: string, poolIds: ComponentID[]) =>
    getFilterByStateFunc(statePattern)(statePattern.replace('$', ''), poolIds);

  const [negatedStatePatterns, patterns] = partition(allPatterns, (p) => p.startsWith('!$'));
  const [statePatterns, nonStatePatterns] = partition(patterns, (p) => p.startsWith('$') || p.includes(' AND '));
  const nonStatePatternsNoVer = nonStatePatterns.map((p) => p.split('@')[0]); // no need for the version
  const idsMap: { [id: string]: ComponentID } = Object.fromEntries(ids.map((id) => [id.toStringWithoutVersion(), id]));
  const idsFiltered = nonStatePatternsNoVer.length
    ? multimatch(Object.keys(idsMap), nonStatePatternsNoVer).map((idStr) => idsMap[idStr])
    : [];

  const idsStateFiltered = await mapSeries(statePatterns, async (statePattern) => {
    if (statePattern.includes(' AND ')) {
      let filteredByAnd: ComponentID[] = ids;
      const patternSplit = statePattern.split(' AND ').map((p) => p.trim());
      // check also as legacyId.toString, as it doesn't have the defaultScope
      const idsToCheck = (id: ComponentID) => [id._legacy.toStringWithoutVersion(), id.toStringWithoutVersion()];
      const matchesGlob = (id: ComponentID, glob: string) =>
        multimatch(idsToCheck(id), [glob.split('@')[0]]).length > 0;
      for await (const onePattern of patternSplit) {
        if (onePattern.startsWith('!$')) {
          const excluded = ComponentIdList.fromArray(await filterByState(onePattern.slice(1), filteredByAnd));
          filteredByAnd = filteredByAnd.filter((id) => !excluded.hasWithoutVersion(id));
        } else if (onePattern.startsWith('!')) {
          filteredByAnd = filteredByAnd.filter((id) => !matchesGlob(id, onePattern.slice(1)));
        } else if (onePattern.startsWith('$')) {
          filteredByAnd = await filterByState(onePattern, filteredByAnd);
        } else {
          filteredByAnd = filteredByAnd.filter((id) => matchesGlob(id, onePattern));
        }
      }
      return filteredByAnd;
    }
    return filterByState(statePattern, ids);
  });
  let allIdsFiltered = ComponentIdList.uniqFromArray([...idsFiltered, ...idsStateFiltered.flat()]);
  if (negatedStatePatterns.length) {
    const excludedPerPattern = await mapSeries(negatedStatePatterns, (p) => filterByState(p.slice(1), allIdsFiltered));
    const excluded = ComponentIdList.fromArray(excludedPerPattern.flat());
    allIdsFiltered = ComponentIdList.fromArray(allIdsFiltered.filter((id) => !excluded.hasWithoutVersion(id)));
  }
  if (throwForNoMatch && !allIdsFiltered.length) {
    throw new NoIdMatchPattern(pattern);
  }
  return allIdsFiltered;
}
