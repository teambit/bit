import type { ComponentIdGraph } from '@teambit/graph';

export type CapsulePromotion = {
  dependentId: string;
  dependencyId: string;
};

/**
 * Mutate the capsule/package partition until every dependency of a package candidate is also a package candidate.
 * IDs must include versions so different versions of the same component remain independent graph nodes.
 */
export function enforceDependencyClosedPackageSet(
  graph: ComponentIdGraph,
  capsuleIds: Set<string>,
  packageCandidateIds: Set<string>
): CapsulePromotion[] {
  const dependentsByDependencyId = new Map<string, Set<string>>();
  graph.edges.forEach((edge) => {
    const sourceId = graph.node(edge.sourceId)?.attr?.toString();
    const targetId = graph.node(edge.targetId)?.attr?.toString();
    if (!sourceId || !targetId) return;
    const dependents = dependentsByDependencyId.get(targetId) ?? new Set<string>();
    dependents.add(sourceId);
    dependentsByDependencyId.set(targetId, dependents);
  });

  const promotions: CapsulePromotion[] = [];
  const capsuleQueue = [...capsuleIds];
  for (let queueIndex = 0; queueIndex < capsuleQueue.length; queueIndex += 1) {
    const dependencyId = capsuleQueue[queueIndex];
    dependentsByDependencyId.get(dependencyId)?.forEach((dependentId) => {
      if (!packageCandidateIds.delete(dependentId)) return;
      capsuleIds.add(dependentId);
      capsuleQueue.push(dependentId);
      promotions.push({ dependentId, dependencyId });
    });
  }

  return promotions;
}
