import {
  createShorthand,
  ensureCompatible,
  expandRanges,
  formatIntersection,
  intersect,
  mergeBounds,
  parseRange,
} from 'semver-intersect';
import semver, { Range, SemVer } from 'semver';
import { PackageNameIndex, PackageNameIndexItem } from './index-by-dep-id';
import { DedupedDependencies, dedupeDependencies } from './dedupe-dependencies';
import { PackageName, DependenciesObjectDefinition } from '../../types';
import { PEER_DEP_LIFECYCLE_TYPE, KEY_NAME_BY_LIFECYCLE_TYPE } from '../../constants';
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
  const result: DedupedDependencies = {
    rootDependencies: {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    },
    componentDependenciesMap: new Map<PackageName, DependenciesObjectDefinition>(),
  };

  depIdIndex.forEach((indexItems, packageName) => {
    if (indexItems.length === 1) {
      return addOneOccurrenceToRoot(result, packageName, indexItems[0]);
    }
  });

  return result;
  // Handle peer dependnecies
  // handle git urls
  // Handle logical or (||)
}

/**
 * In case there is only one component with a specific dependency, add it to the root if it's not peer
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {PackageName} packageName
 * @param {PackageNameIndexItem} indexItem
 */
function addOneOccurrenceToRoot(
  dedupedDependencies: DedupedDependencies,
  packageName: PackageName,
  indexItem: PackageNameIndexItem
): void {
  if (indexItem.lifecycleType !== PEER_DEP_LIFECYCLE_TYPE) {
    const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[indexItem.lifecycleType];
    dedupedDependencies.rootDependencies[keyName][packageName] = indexItem.range;
  }
}
