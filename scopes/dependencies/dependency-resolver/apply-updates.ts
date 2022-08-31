import { OutdatedPkg } from './get-all-policy-pkgs';
import { VariantPolicyConfigObject, WorkspacePolicyEntry } from './policy';

/**
 * Applies updates to policies.
 */
export function applyUpdates(
  outdatedPkgs: Array<Omit<OutdatedPkg, 'currentRange'>>,
  {
    variantPoliciesByPatterns,
    componentPoliciesById,
  }: {
    variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
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
      case 'component-model':
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
          const { variantPattern, targetField, name } = outdatedPkg;
          updatedVariants.add(outdatedPkg.variantPattern);
          // eslint-disable-next-line dot-notation
          if (variantPoliciesByPatterns[variantPattern]?.[targetField]?.[name]?.['version']) {
            // eslint-disable-line
            variantPoliciesByPatterns[variantPattern][targetField]![name]['version'] = outdatedPkg.latestRange; // eslint-disable-line
          } else {
            variantPoliciesByPatterns[variantPattern][targetField]![name] = outdatedPkg.latestRange; // eslint-disable-line
          }
        }
        break;
      case 'component':
        if (outdatedPkg.componentId) {
          updatedComponents.add(outdatedPkg.componentId);
          if (componentPoliciesById[outdatedPkg.componentId][outdatedPkg.targetField][outdatedPkg.name].version) {
            componentPoliciesById[outdatedPkg.componentId][outdatedPkg.targetField][outdatedPkg.name].version =
              outdatedPkg.latestRange;
          } else {
            componentPoliciesById[outdatedPkg.componentId][outdatedPkg.targetField][outdatedPkg.name] =
              outdatedPkg.latestRange;
          }
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
