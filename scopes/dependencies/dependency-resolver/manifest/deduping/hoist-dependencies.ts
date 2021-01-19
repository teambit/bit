import { countBy, forEachObjIndexed, prop, sortBy, uniq } from 'ramda';
import semver from 'semver';
import { intersect, parseRange } from 'semver-intersect';

import {
  DEV_DEP_LIFECYCLE_TYPE,
  KEY_NAME_BY_LIFECYCLE_TYPE,
  PEER_DEP_LIFECYCLE_TYPE,
  RUNTIME_DEP_LIFECYCLE_TYPE,
} from '../../dependencies/constants';
import { ManifestDependenciesObject } from '../manifest';
import { DependencyLifecycleType, SemverVersion, PackageName } from '../../dependencies';
import { DedupedDependencies, DedupedDependenciesPeerConflicts } from './dedupe-dependencies';
import { PackageNameIndex, PackageNameIndexItem, PackageNameIndexComponentItem } from './index-by-dep-id';

type ItemsGroupedByRangeOrVersion = {
  ranges: PackageNameIndexComponentItem[];
  versions: PackageNameIndexComponentItem[];
};

type MostCommonVersion = {
  version: SemverVersion;
  count: number;
};

type BestRange = {
  count: number;
  ranges: SemverVersion[];
  intersectedRange: SemverVersion;
};

type CombinationWithTotal = {
  combination: SemverVersion[];
  total: number;
};

/**
 * This is the second phase of the deduping process.
 * It will get the index calculated in the first phase (with dep id as key)
 * and will find the most intersect range for each dep and move it to the root
 * it will also move deps which are both dev deps and runtime deps to be runtime deps
 *
 * @param {PackageNameIndex} depIdIndex
 * @returns {DedupedDependencies}
 */
export function hoistDependencies(depIdIndex: PackageNameIndex): DedupedDependencies {
  const result: DedupedDependencies = getEmptyDedupedDependencies();

  // TODO: handle git urls

  depIdIndex.forEach((indexItem, packageName) => {
    let toContinue;
    toContinue = handlePreserved(result, packageName, indexItem);
    if (!toContinue) return;
    toContinue = addOneOccurrenceToRoot(result, packageName, indexItem.componentItems);
    if (!toContinue) return;
    toContinue = handlePeersOnly(result, packageName, indexItem.componentItems);
    if (!toContinue) return;
    const groupedByRangeOrVersion = groupByRangeOrVersion(indexItem.componentItems);
    if (groupedByRangeOrVersion.versions.length > 0 && groupedByRangeOrVersion.ranges.length === 0) {
      handleExactVersionsOnly(result, packageName, indexItem.componentItems);
    } else if (groupedByRangeOrVersion.versions.length === 0 && groupedByRangeOrVersion.ranges.length > 0) {
      handleRangesOnly(result, packageName, indexItem.componentItems);
    } else {
      handleRangesAndVersions(result, packageName, indexItem.componentItems, groupedByRangeOrVersion);
    }
  });

  return result;
}

function handlePreserved(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItem: PackageNameIndexItem
): boolean {
  const preservedVersion = indexItem.metadata.preservedVersion;
  // Not preserved, move on
  if (!preservedVersion) {
    return true;
  }

  const preservedLifecycleType = indexItem.metadata.preservedLifecycleType;

  const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[preservedLifecycleType || 'dependencies'];
  dedupedDependencies.rootDependencies[keyName][packageName] = preservedVersion;

  const filterFunc = (item: PackageNameIndexComponentItem) => {
    // items which are intersect with the preserved version won't needed to be installed nested in the component
    // this in very rare cases might create bugs in case the version are intersects, but the real version in the registry
    // which satisfies the preserved not satisfy the item range.
    // In such case I would expect to get version not exist when coming to install the version in the nested component
    return !!intersectNoThrow(item.range, preservedVersion);
  };

  indexItem.componentItems.map(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName, filterFunc));
  return false;
}

/**
 * In case there is only one component with a specific dependency, add it to the root if it's not peer
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexComponentItem} indexItem
 */
function addOneOccurrenceToRoot(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItems: PackageNameIndexComponentItem[]
): boolean {
  if (indexItems.length > 1) {
    return true;
  }
  const indexItem = indexItems[0];
  // if (indexItem.lifecycleType !== PEER_DEP_LIFECYCLE_TYPE) {
  const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[indexItem.lifecycleType];
  dedupedDependencies.rootDependencies[keyName][packageName] = indexItem.range;
  return false;
  // }
  // return true;
}

/**
 * Handle a case where the package appear as a peer for all its deponents
 * in that case we won't hoist it to the root, we will only notify about conflicts
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexComponentItem[]} indexItems
 * @returns {boolean}
 */
function handlePeersOnly(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItems: PackageNameIndexComponentItem[]
): boolean {
  const nonPeerItems = indexItems.filter((item) => {
    return item.lifecycleType !== PEER_DEP_LIFECYCLE_TYPE;
  });
  if (nonPeerItems.length > 0) {
    return true;
  }
  const allRanges = indexItems.map((item) => item.range);
  try {
    intersect(...allRanges);
    // Add to peers for each component to make sure we are getting warning from the package manager about missing peers
    indexItems.map(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName));
  } catch (e) {
    indexItems.map(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName));
    // There are peer version with conflicts, let the user know about it
    const conflictedComponents = indexItems.map((item) => {
      return {
        componentPackageName: item.origin,
        range: item.range,
      };
    });
    const issue: DedupedDependenciesPeerConflicts = {
      packageName,
      conflictedComponents,
      conflictMessage: e.message,
    };
    dedupedDependencies.issus?.peerConflicts.push(issue);
  }
  return false;
}

/**
 * This will handle a case when there is only exact version in the index
 * In such case it will take the most common version and hoist it to the root
 * It will set all the other version in the corresponding components
 * This assume the items has been already checked to contain only exact versions
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexComponentItem[]} indexItems
 */
function handleExactVersionsOnly(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItems: PackageNameIndexComponentItem[]
): void {
  const allVersions = indexItems.map((item) => item.range);

  // Add most common version to root
  const mostCommonVersion = findMostCommonVersion(allVersions).version;
  const lifeCycleType = getLifecycleType(indexItems);
  const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[lifeCycleType];
  dedupedDependencies.rootDependencies[depKeyName][packageName] = mostCommonVersion;

  const filterFunc = (item) => {
    if (item.range === mostCommonVersion) return true;
    return false;
  };

  indexItems.forEach(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName, filterFunc));
}

/**
 * This will handle a case when there is only ranges in the index
 * In such case it will search for an intersection with the most components and hoist it to the root
 * It will set all the other ranges in the corresponding components
 * This assume the items has been already checked to contain only ranges
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexComponentItem[]} indexItems
 */
function handleRangesOnly(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItems: PackageNameIndexComponentItem[]
): void {
  const rangesVersions = indexItems.map((item) => item.range);
  const bestRange = findBestRange(rangesVersions);
  const lifeCycleType = getLifecycleType(indexItems);
  const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[lifeCycleType];
  dedupedDependencies.rootDependencies[depKeyName][packageName] = bestRange.intersectedRange;

  indexItems.forEach((item) => {
    if (bestRange.ranges.includes(item.range)) return;
    addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName)(item);
  });

  const filterFunc = (item) => {
    if (bestRange.ranges.includes(item.range)) return true;
    return false;
  };

  indexItems.forEach(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName, filterFunc));
}

/**
 * This will handle a case when there is both ranges and exact versions in the index
 * it will find the best range and see how many components it fits
 * it will find the most common version and see how many components it fits
 * Then it will take the best of them and hoist into the root and put others in the components
 * TODO: this can be improved by adding to the ranges count the satisfying exact versions
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexComponentItem[]} indexItems
 * @param {ItemsGroupedByRangeOrVersion} groups
 */
function handleRangesAndVersions(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItems: PackageNameIndexComponentItem[],
  groups: ItemsGroupedByRangeOrVersion
): void {
  const allVersions = groups.versions.map((item) => item.range);
  const mostCommonVersion = findMostCommonVersion(allVersions);
  // Include versions here since we might have a specific version which match the best version as well
  const rangesVersions = indexItems.map((item) => item.range);
  const bestRange = findBestRange(rangesVersions);
  const lifeCycleType = getLifecycleType(indexItems);
  const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[lifeCycleType];

  let filterFunc = (item) => {
    if (bestRange.ranges.includes(item.range)) return true;
    return false;
  };

  if (bestRange.count < mostCommonVersion.count) {
    dedupedDependencies.rootDependencies[depKeyName][packageName] = mostCommonVersion.version;
    filterFunc = (item) => {
      if (item.range === mostCommonVersion) return true;
      return false;
    };
  } else {
    dedupedDependencies.rootDependencies[depKeyName][packageName] = bestRange.intersectedRange;
  }
  indexItems.forEach(addToComponentDependenciesMapInDeduped(dedupedDependencies, packageName, filterFunc));
}

/**
 * Finding the best range - a range the intersect as many ranges as possible
 * it will work by create all the possible combination of the ranges
 * then try to intersect them based on the number of the ranges (items) and how many times they appear in the original array
 *
 * @param {SemverVersion[]} ranges
 * @returns {BestRange}
 */
function findBestRange(ranges: SemverVersion[]): BestRange {
  const result: BestRange = {
    ranges: [],
    intersectedRange: '0.0.0',
    count: 0,
  };

  const sortedByTotal = getSortedRangesCombination(ranges);
  let i = 0;
  // Since it's already sorted by count, once we found match we can stop looping
  while (result.count === 0 && i < sortedByTotal.length) {
    const combinationWithTotal = sortedByTotal[i];
    try {
      const intersectedRange = intersect(...combinationWithTotal.combination);
      result.intersectedRange = intersectedRange;
      result.ranges = combinationWithTotal.combination;
      result.count = combinationWithTotal.total;
      // eslint-disable-next-line
    } catch (e) {}
    i += 1;
  }
  return result;
}

// function getSortedVersionsWithTotal(versions: SemverVersion[]): VersionWithTotal[] {
//   const counts = countBy((item) => item)(versions);
//   const uniqVersions = uniq(versions);
//   const versionsWithTotalCount = uniqVersions.map((version) => {
//     return {
//       version,
//       total: counts[version],
//     };
//   });

//   const sortByTotal = sortBy(prop('total'));
//   const sortedByTotal = sortByTotal(versionsWithTotalCount).reverse();
//   return sortedByTotal;
// }

function getSortedRangesCombination(ranges: SemverVersion[]): CombinationWithTotal[] {
  const counts = countBy((item) => item)(ranges);
  const uniqRanges = uniq(ranges);
  const rangesCombinations = arrayCombinations<SemverVersion>(uniqRanges);
  const countMultipleRanges = (items: SemverVersion[]): number => {
    return items.reduce((acc, curr) => {
      return acc + counts[curr];
    }, 0);
  };
  // The count is count of the items and for each item how many times it appear in the original ranges
  // Since there might be same range multiple time in the original ranges array.

  const rangesCombinationsWithTotalCount = rangesCombinations.map((combination) => {
    return {
      combination,
      total: countMultipleRanges(combination),
    };
  });

  const sortByTotal = sortBy(prop('total'));
  const sortedByTotal = sortByTotal(rangesCombinationsWithTotalCount).reverse();
  return sortedByTotal;
}

/**
 * Check if a package should be a dev dependency or runtime dependency by checking if it appears as runtime dependency at least once
 *
 * @param {PackageNameIndexComponentItem[]} indexItems
 * @returns {DependencyLifecycleType}
 */
function getLifecycleType(indexItems: PackageNameIndexComponentItem[]): DependencyLifecycleType {
  let result: DependencyLifecycleType = DEV_DEP_LIFECYCLE_TYPE;
  indexItems.forEach((item) => {
    if (item.lifecycleType === RUNTIME_DEP_LIFECYCLE_TYPE) {
      result = RUNTIME_DEP_LIFECYCLE_TYPE;
    }
  });
  return result;
}

/**
 * Find the version that appears the most
 *
 * @param {SemverVersion[]} versions
 * @returns {MostCommonVersion}
 */
function findMostCommonVersion(versions: SemverVersion[]): MostCommonVersion {
  const counts = countBy((item) => item)(versions);
  const result: MostCommonVersion = {
    version: '0.0.0',
    count: 0,
  };
  forEachObjIndexed((count, version) => {
    if (count > result.count) {
      result.version = version;
      result.count = count;
    }
  }, counts);
  return result;
}

/**
 * A wrapper function used to be passed to map on index items and add it to a component dependency in the deduped dependencies if it's filter function return false
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {(item: PackageNameIndexComponentItem) => boolean} [filterFunc]
 * @returns
 */
function addToComponentDependenciesMapInDeduped(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  filterFunc?: (item: PackageNameIndexComponentItem) => boolean
) {
  return (indexItem: PackageNameIndexComponentItem) => {
    if (filterFunc && typeof filterFunc === 'function') {
      const toFilter = filterFunc(indexItem);
      if (toFilter) return;
    }
    let compEntry = dedupedDependencies.componentDependenciesMap.get(indexItem.origin);
    const depKeyName = KEY_NAME_BY_LIFECYCLE_TYPE[indexItem.lifecycleType];
    if (!compEntry) {
      compEntry = {
        dependencies: {},
        devDependencies: {},
        peerDependencies: {},
      };
    }
    compEntry[depKeyName] = Object.assign({}, compEntry[depKeyName], { [packageName]: indexItem.range });
    dedupedDependencies.componentDependenciesMap.set(indexItem.origin, compEntry);
  };
}

/**
 * Get an array of index items and group them to items with ranges and items with exact version
 *
 * @param {PackageNameIndexComponentItem[]} indexItems
 * @returns {ItemsGroupedByRangeOrVersion}
 */
function groupByRangeOrVersion(indexItems: PackageNameIndexComponentItem[]): ItemsGroupedByRangeOrVersion {
  const result: ItemsGroupedByRangeOrVersion = {
    ranges: [],
    versions: [],
  };
  indexItems.forEach((item) => {
    const parsed = parseRange(semver.validRange(item.range));
    if (parsed.condition === '=') {
      result.versions.push(item);
      return;
    }
    result.ranges.push(item);
  });
  return result;
}

// Taken from https://web.archive.org/web/20140418004051/http://dzone.com/snippets/calculate-all-combinations
/**
 * Return all combinations of array items. for example:
 * arrayCombinations([1,2]) == [[1], [2], [1,2]];
 *
 * @param {Array<T>} array
 * @returns {Array<T[]>}
 */
function arrayCombinations<T>(array: Array<T>): Array<T[]> {
  const fn = function (n, src, got, all) {
    if (n === 0) {
      if (got.length > 0) {
        all[all.length] = got;
      }
      return;
    }
    // eslint-disable-next-line
    for (let j = 0; j < src.length; j++) {
      fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
    }
  };
  const all: Array<T[]> = [];
  // eslint-disable-next-line
  for (let i = 0; i < array.length; i++) {
    fn(i, array, [], all);
  }
  all.push(array);
  return all;
}

export function getEmptyDedupedDependencies(): DedupedDependencies {
  const result: DedupedDependencies = {
    rootDependencies: {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    },
    componentDependenciesMap: new Map<PackageName, ManifestDependenciesObject>(),
    issus: {
      peerConflicts: [],
    },
  };
  return result;
}

function intersectNoThrow(...args): string | undefined {
  try {
    return intersect(...args);
  } catch (e) {
    return undefined;
  }
}
