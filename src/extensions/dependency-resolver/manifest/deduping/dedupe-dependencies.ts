import { indexByDepId } from './index-by-dep-id';
import { hoistDependencies } from './hoist-dependencies';
import { mergeWithRootDeps } from './merge-with-root';
import { PackageName, DependenciesObjectDefinition, SemverVersion } from '../../types';
import { ComponentDependenciesMap } from '../workspace-manifest';

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
  rootDependencies: DependenciesObjectDefinition;
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
 * @param {DependenciesObjectDefinition} rootDependencies
 * @param {ComponentDependenciesMap} componentDependenciesMap
 * @returns {DedupedDependencies}
 */
export function dedupeDependencies(
  rootDependencies: DependenciesObjectDefinition,
  componentDependenciesMap: ComponentDependenciesMap
): DedupedDependencies {
  const indexedByDepId = indexByDepId(componentDependenciesMap);
  const dedupedDependenciesWithoutRootOriginal = hoistDependencies(indexedByDepId);
  const result = mergeWithRootDeps(rootDependencies, dedupedDependenciesWithoutRootOriginal);
  return result;
}
