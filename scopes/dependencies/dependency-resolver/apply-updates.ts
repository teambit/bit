import type { ComponentID } from '@teambit/component';
import type { MergedOutdatedPkg } from './dependency-resolver.main.runtime';
import type { VariantPolicyConfigObject, WorkspacePolicyEntry } from './policy';

export interface UpdatedComponent {
  componentId: ComponentID;
  config: Record<string, any>;
}

/**
 * Applies updates to policies.
 */
export function applyUpdates(
  outdatedPkgs: Array<Omit<MergedOutdatedPkg, 'currentRange'>>,
  {
    variantPoliciesByPatterns,
  }: {
    variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
  }
): {
  updatedVariants: string[];
  updatedComponents: UpdatedComponent[];
  updatedWorkspacePolicyEntries: WorkspacePolicyEntry[];
} {
  const updatedWorkspacePolicyEntries: WorkspacePolicyEntry[] = [];
  const updatedVariants = new Set<string>();
  const updatedComponents = new Map<string, UpdatedComponent>();

  for (const outdatedPkg of outdatedPkgs) {
    if (
      outdatedPkg.source === 'component' ||
      (outdatedPkg.source === 'rootPolicy' && outdatedPkg.dependentComponents?.length && !outdatedPkg.isAuto)
    ) {
      // eslint-disable-next-line
      (outdatedPkg.dependentComponents ?? [outdatedPkg.componentId!]).forEach((componentId) => {
        const id = componentId.toString();
        if (!updatedComponents.has(id)) {
          updatedComponents.set(id, { componentId, config: { policy: {} } });
        }
        const { config } = updatedComponents.get(id)!; // eslint-disable-line
        if (!config.policy[outdatedPkg.targetField]) {
          config.policy[outdatedPkg.targetField] = {};
        }
        config.policy[outdatedPkg.targetField][outdatedPkg.name] = outdatedPkg.latestRange;
      });
    } else {
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
            // eslint-disable-next-line dot-notation, @typescript-eslint/dot-notation
            if (variantPoliciesByPatterns[variantPattern]?.[targetField]?.[name]?.['version']) {
              // eslint-disable-line
              variantPoliciesByPatterns[variantPattern][targetField]![name]['version'] = outdatedPkg.latestRange; // eslint-disable-line
            } else {
              variantPoliciesByPatterns[variantPattern][targetField]![name] = outdatedPkg.latestRange; // eslint-disable-line
            }
          }
          break;
        default:
          throw new Error(`Unsupported policy source for update: ${outdatedPkg.source}`);
      }
    }
  }
  return {
    updatedVariants: Array.from(updatedVariants),
    updatedComponents: Array.from(updatedComponents.values()),
    updatedWorkspacePolicyEntries,
  };
}
