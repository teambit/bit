import type { ManifestDependenciesKeysNames, ManifestDependenciesObject } from '../manifest';
import type { WorkspacePolicy } from '../../policy';
import type { PackageName, SemverVersion } from '../../dependencies';
import type { ComponentDependenciesMap } from '../workspace-manifest-factory';
import { hoistDependencies } from './hoist-dependencies';
import { indexByDepId } from './index-by-dep-id';
import { mergeWithRootDeps } from './merge-with-root';

export { getEmptyDedupedDependencies } from './hoist-dependencies';

export type conflictedComponent = {
  componentPackageName: PackageName;
  range: SemverVersion;
};

export type DedupedDependenciesPeerConflicts = {
  packageName: PackageName;
  conflictedComponents: conflictedComponent[];
  conflictMessage: string;
};

export type DedupedDependenciesIssues = {
  peerConflicts: DedupedDependenciesPeerConflicts[];
};

export type DedupedDependencies = {
  rootDependencies: Omit<ManifestDependenciesObject, 'peerDependenciesMeta'>;
  componentDependenciesMap: ComponentDependenciesMap;
  issus?: DedupedDependenciesIssues;
};

/**
 * Main function to dedupe dependencies
 * It will optimized the dependencies structure to make sure there is minimum duplication of the same dependency (as a result of conflicted versions)
 * it will take everything possible to be defined in the root, and only conflicts in the components
 * it's similar to what happens when you use yarn workspaces
 *
 * @export
 * @returns {DedupedDependencies}
 */
export function dedupeDependencies(
  rootPolicy: WorkspacePolicy,
  componentDependenciesMap: ComponentDependenciesMap,
  options?: {
    hoistedDepFields?: ManifestDependenciesKeysNames[];
    dedupePeerDependencies?: boolean;
  }
): DedupedDependencies {
  const indexedByDepId = indexByDepId(rootPolicy, componentDependenciesMap, options?.hoistedDepFields);
  const dedupedDependenciesWithoutRootOriginal = hoistDependencies(indexedByDepId, options);
  const result = mergeWithRootDeps(rootPolicy.toManifest(), dedupedDependenciesWithoutRootOriginal);
  return result;
}
