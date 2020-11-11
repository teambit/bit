import type { DependencyList, DependencyLifecycleType } from '../dependencies';

export function serializeByLifecycle(deps: DependencyList, lifecycle: DependencyLifecycleType) {
  const peerDeps = deps.filter((dep) => dep.lifecycle === lifecycle);
  const depIds = peerDeps.dependencies.map((dep) =>
    dep.getPackageName ? `${dep.getPackageName()}@${dep.version}` : ''
  );
  return depIds.join('\n');
}
