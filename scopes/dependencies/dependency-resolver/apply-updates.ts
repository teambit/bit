import { DependencyResolverMain } from './dependency-resolver.main.runtime';
import { DependencyResolverAspect } from './dependency-resolver.aspect';
import { OutdatedPkg } from './get-outdated-workspace-pkgs';
import { WorkspacePolicyEntry } from './policy';

export function applyUpdates(
  outdatedPkgs: Array<Omit<OutdatedPkg, 'currentRange'>>,
  {
    dependencyResolver,
    variantPatterns,
    componentPoliciesById,
  }: {
    dependencyResolver: DependencyResolverMain;
    variantPatterns: Record<string, any>;
    componentPoliciesById: Record<string, any>;
  }
) {
  const updatedWorkspacePolicyEntries: WorkspacePolicyEntry[] = outdatedPkgs
    .filter(({ source }) => source === 'rootPolicy')
    .map(
      (outdatedPkg) =>
        ({
          dependencyId: outdatedPkg.name,
          value: {
            version: outdatedPkg.latestRange,
          },
          lifecycleType: outdatedPkg.targetField === 'peerDependencies' ? 'peer' : 'runtime',
        } as WorkspacePolicyEntry)
    );
  dependencyResolver.addToRootPolicy(updatedWorkspacePolicyEntries, {
    updateExisting: true,
  });
  const updateVariantPolicies = new Map();
  const updatedComponents = new Set<string>();
  for (const outdatedPkg of outdatedPkgs) {
    if (outdatedPkg.variantPattern) {
      if (!updateVariantPolicies.has(outdatedPkg.variantPattern)) {
        updateVariantPolicies.set(
          outdatedPkg.variantPattern,
          variantPatterns[outdatedPkg.variantPattern][DependencyResolverAspect.id]
        );
      }
      updateVariantPolicies.get(outdatedPkg.variantPattern).policy[outdatedPkg.targetField][outdatedPkg.name] =
        outdatedPkg.latestRange;
    } else if (outdatedPkg.componentId) {
      updatedComponents.add(outdatedPkg.componentId);
      componentPoliciesById[outdatedPkg.componentId][outdatedPkg.targetField][outdatedPkg.name] =
        outdatedPkg.latestRange;
    }
  }
  return {
    updatedVariants: Array.from(updateVariantPolicies.keys()),
    updatedComponents: Array.from(updatedComponents),
  };
}
