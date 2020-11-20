import { ManifestDependenciesObject } from '../manifest';
import { WorkspacePolicy } from '../../policy';
import { PackageName, SemverVersion } from '../../dependencies';
import { ComponentDependenciesMap } from '../workspace-manifest-factory';
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
  rootDependencies: ManifestDependenciesObject;
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
  componentDependenciesMap: ComponentDependenciesMap
): DedupedDependencies {
  const indexedByDepId = indexByDepId(rootPolicy, componentDependenciesMap);
  const dedupedDependenciesWithoutRootOriginal = hoistDependencies(indexedByDepId);
  const result = mergeWithRootDeps(rootPolicy.toManifest(), dedupedDependenciesWithoutRootOriginal);
  return result;
}
