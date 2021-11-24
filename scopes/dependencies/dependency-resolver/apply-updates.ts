import { OutdatedPkg } from './get-all-policy-pkgs';
import { WorkspacePolicyEntry } from './policy';

/**
 * Applies updates to policies.
 */
export function applyUpdates(
  outdatedPkgs: Array<Omit<OutdatedPkg, 'currentRange'>>,
  {
    variantPoliciesByPatterns,
    componentPoliciesById,
  }: {
    variantPoliciesByPatterns: Record<string, any>;
    componentPoliciesById: Record<string, any>;
  }
): {
  updatedVariants: string[];
  updatedComponents: string[];
  updatedWorkspacePolicyEntries: WorkspacePolicyEntry[];
} {
  const updatedWorkspacePolicyEntries: WorkspacePolicyEntry[] = [];
  const updatedVariants = new Set<string>();
  const updatedComponents = new Set<string>();

  for (const outdatedPkg of outdatedPkgs) {
    switch (outdatedPkg.source) {
      case 'rootPolicy':
        updatedWorkspacePolicyEntries.push({
          dependencyId: outdatedPkg.name,
          value: {
            version: outdatedPkg.latestRange,
          },
          lifecycleType: outdatedPkg.targetField === 'peerDependencies' ? 'peer' : 'runtime',
        });
        break;
      case 'variants':
        if (outdatedPkg.variantPattern) {
          updatedVariants.add(outdatedPkg.variantPattern);
          variantPoliciesByPatterns[outdatedPkg.variantPattern][outdatedPkg.targetField][outdatedPkg.name] =
            outdatedPkg.latestRange;
        }
        break;
      case 'component':
        if (outdatedPkg.componentId) {
          updatedComponents.add(outdatedPkg.componentId);
          componentPoliciesById[outdatedPkg.componentId][outdatedPkg.targetField][outdatedPkg.name] =
            outdatedPkg.latestRange;
        }
        break;
      default:
        throw new Error(`Unsupported policy source for update: ${outdatedPkg.source}`);
    }
  }
  return {
    updatedVariants: Array.from(updatedVariants),
    updatedComponents: Array.from(updatedComponents),
    updatedWorkspacePolicyEntries,
  };
}
