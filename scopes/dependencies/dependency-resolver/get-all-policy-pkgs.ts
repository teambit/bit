import { ManifestDependenciesKeysNames } from './manifest';
import { VariantPolicyConfigObject, WorkspacePolicy } from './policy';

type CurrentPkg = {
  name: string;
  currentRange: string;
  source: 'variants' | 'component' | 'rootPolicy';
  variantPattern?: string | null;
  componentId?: string;
  targetField: ManifestDependenciesKeysNames;
};

export type OutdatedPkg = CurrentPkg & {
  latestRange: string;
};

/**
 * Get packages from root policy, variants, and component config files (component.json files).
 */
export function getAllPolicyPkgs({
  rootPolicy,
  variantPoliciesByPatterns,
  componentPoliciesById,
}: {
  rootPolicy: WorkspacePolicy;
  variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
  componentPoliciesById: Record<string, VariantPolicyConfigObject>;
}): Array<Omit<OutdatedPkg, 'latestRange'>> {
  return [
    ...getPkgsFromRootPolicy(rootPolicy),
    ...getPkgsFromVariants(variantPoliciesByPatterns),
    ...getPkgsFromComponents(componentPoliciesById),
  ];
}

function getPkgsFromRootPolicy(rootPolicy: WorkspacePolicy): CurrentPkg[] {
  return rootPolicy.entries.map((entry) => ({
    name: entry.dependencyId,
    currentRange: entry.value.version,
    source: 'rootPolicy',
    variantPattern: null as string | null,
    targetField: entry.lifecycleType === 'runtime' ? 'dependencies' : 'peerDependencies',
  }));
}

function getPkgsFromVariants(variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>): CurrentPkg[] {
  return Object.entries(variantPoliciesByPatterns)
    .filter(([, variant]) => variant != null)
    .map(([variantPattern, variant]) => {
      return readAllDependenciesFromPolicyObject({ source: 'variants', variantPattern }, variant);
    })
    .flat();
}

function getPkgsFromComponents(componentPoliciesById: Record<string, VariantPolicyConfigObject>): CurrentPkg[] {
  return Object.entries(componentPoliciesById)
    .map(([componentId, policy]) => {
      return readAllDependenciesFromPolicyObject({ source: 'component', componentId }, policy);
    })
    .flat();
}

function readAllDependenciesFromPolicyObject(
  context: Pick<CurrentPkg, 'source' | 'componentId' | 'variantPattern'>,
  policy: VariantPolicyConfigObject
): CurrentPkg[] {
  const pkgs: CurrentPkg[] = [];
  for (const targetField of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ] as ManifestDependenciesKeysNames[]) {
    for (const [name, currentRange] of Object.entries(policy[targetField] ?? {})) {
      if (currentRange !== '-') {
        pkgs.push({
          ...context,
          name,
          currentRange: typeof currentRange === 'string' ? currentRange : currentRange.version,
          targetField,
        });
      }
    }
  }
  return pkgs;
}
