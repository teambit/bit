import { forEachObjIndexed } from 'ramda';
import { SemVer } from 'semver';

import { PackageName } from '../../dependencies';
import { ManifestDependenciesObject, ManifestDependenciesKeysNames, DepObjectValue } from '../manifest';
import { DedupedDependencies } from './dedupe-dependencies';

/**
 * This is the third phase of the deduping process
 * It's not exactly part of the dedupe process but its required for the bit install to work properly
 * it will take the deduped dependencies and will add them missing deps from the provided root deps
 * it used for installing deps in the root level before any component use it
 * otherwise they won't be install, and you will need to re-run install after writing the require statement in the code
 *
 * @returns {DedupedDependencies}
 */
export function mergeWithRootDeps(
  rootDependencies: ManifestDependenciesObject,
  dedupedDependencies: DedupedDependencies
): DedupedDependencies {
  forEachObjIndexed(mergeSpecificLifeCycleRootDepsToDedupedDependencies(dedupedDependencies), rootDependencies);
  return dedupedDependencies;
}

function mergeSpecificLifeCycleRootDepsToDedupedDependencies(dedupedDependencies: DedupedDependencies) {
  return (deps: DepObjectValue, depKeyName: ManifestDependenciesKeysNames) => {
    forEachObjIndexed(mergeRootDepToDedupedDependencies(dedupedDependencies, depKeyName), deps);
  };
}

function mergeRootDepToDedupedDependencies(
  dedupedDependencies: DedupedDependencies,
  depKeyName: ManifestDependenciesKeysNames
) {
  return (range: SemVer, depId: PackageName) => {
    // Do not add it if it's already exist from the components calculation
    if (isDepExistInAnyOfTheRootDedupedDependencies(depId, dedupedDependencies)) return;
    const existingRootDeps = dedupedDependencies.rootDependencies;
    if (existingRootDeps[depKeyName]) {
      // @ts-ignore - for some reason ts thinks it might be undefined
      existingRootDeps[depKeyName][depId] = range.toString();
    } else {
      existingRootDeps[depKeyName] = {
        [depId]: range.toString(),
      };
    }
  };
}

function isDepExistInAnyOfTheRootDedupedDependencies(depId: string, dedupedDependencies: DedupedDependencies) {
  const rootDedupedDeps = dedupedDependencies.rootDependencies;
  return (
    isDepExistInDepObject(depId, rootDedupedDeps.dependencies) ||
    isDepExistInDepObject(depId, rootDedupedDeps.devDependencies) ||
    isDepExistInDepObject(depId, rootDedupedDeps.peerDependencies)
  );
}

function isDepExistInDepObject(depId: string, depObjectValue: DepObjectValue = {}) {
  return !!depObjectValue[depId];
}
