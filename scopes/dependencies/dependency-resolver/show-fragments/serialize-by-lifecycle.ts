import { maxBy } from 'lodash';
import type { DependencyList, DependencyLifecycleType, Dependency } from '../dependencies';

export function serializeByLifecycle(deps: DependencyList, lifecycle: DependencyLifecycleType) {
  const filteredByLifecycle = deps.filter((dep) => dep.lifecycle === lifecycle);
  const longestLength = getLongestDepName(filteredByLifecycle);
  const paddedNames = filteredByLifecycle.dependencies.map((dep) => {
    const paddedName = getNameWithVersion(dep).padEnd(longestLength + 1, '-');
    return `${paddedName} (${dep.type})`;
  });
  return paddedNames.join('\n');
}

function getLongestDepName(deps: DependencyList): number {
  const longestDep = maxBy(deps.dependencies, (dep) => getNameWithVersion(dep).length);
  if (!longestDep) return 50;
  return getNameWithVersion(longestDep).length;
}

function getNameWithVersion(dep: Dependency) {
  const nameWithVersion = dep.getPackageName?.()
    ? `${dep.getPackageName?.()}@${dep.version}`
    : `${dep.id}@${dep.version}`;
  return nameWithVersion;
}
