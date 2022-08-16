import { ManifestDependenciesKeysNames } from './manifest';
import { VariantPolicyConfigObject, WorkspacePolicy } from './policy';
import { DependencyLifecycleType } from './dependencies/dependency';
import { KEY_NAME_BY_LIFECYCLE_TYPE } from './dependencies';

type CurrentPkg = {
  name: string;
  currentRange: string;
  source: 'variants' | 'component' | 'rootPolicy' | 'component-model';
  variantPattern?: string | null;
  componentId?: string;
  targetField: ManifestDependenciesKeysNames;
};

export type OutdatedPkg = CurrentPkg & {
  latestRange: string;
};

export type ComponentModelVersion = {
  name: string;
  version: string;
  componentId: string;
  lifecycleType: DependencyLifecycleType;
};

/**
 * Get packages from root policy, variants, and component config files (component.json files).
 */
export function getAllPolicyPkgs({
  rootPolicy,
  variantPoliciesByPatterns,
  componentPoliciesById,
  componentModelVersions,
}: {
  rootPolicy: WorkspacePolicy;
  variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
  componentPoliciesById: Record<string, VariantPolicyConfigObject>;
  componentModelVersions: ComponentModelVersion[];
}): CurrentPkg[] {
  const pkgsFromPolicies = getPkgsFromRootPolicy(rootPolicy);
  const pkgsNamesFromPolicies = new Set(pkgsFromPolicies.map(({ name }) => name));
  return [
    ...pkgsFromPolicies,
    ...getPkgsFromVariants(variantPoliciesByPatterns),
    ...getPkgsFromComponents(componentPoliciesById),
    ...componentModelVersions
      .filter(({ name }) => !pkgsNamesFromPolicies.has(name))
      .map((componentDep) => ({
        name: componentDep.name,
        currentRange: componentDep.version,
        source: 'component-model' as const,
        componentId: componentDep.componentId,
        targetField: KEY_NAME_BY_LIFECYCLE_TYPE[componentDep.lifecycleType],
      })),
  ];
}

function getPkgsFromRootPolicy(rootPolicy: WorkspacePolicy): CurrentPkg[] {
  return rootPolicy.entries.map((entry) => ({
    name: entry.dependencyId,
    currentRange: entry.value.version,
    source: 'rootPolicy',
    variantPattern: null as string | null,
    targetField: KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType],
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
