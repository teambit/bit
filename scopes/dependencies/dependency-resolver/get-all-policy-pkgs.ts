import { ComponentID } from '@teambit/component-id';
import { ManifestDependenciesKeysNames } from './manifest';
import { VariantPolicyConfigObject, VariantPolicyEntryValue, WorkspacePolicy } from './policy';
import { DependencyLifecycleType } from './dependencies/dependency';
import { KEY_NAME_BY_LIFECYCLE_TYPE } from './dependencies';

export type CurrentPkgSource =
  // the variants section of "workspace.jsonc"
  | 'variants'
  // these are dependencies set via "bit deps set" or "component.json"
  | 'component'
  // these are dependencies from the dependencies policy in "workspace.jsonc"
  | 'rootPolicy'
  // these are dependencies stored in the component object (snapped/tagged version)
  | 'component-model';

export type CurrentPkg = {
  name: string;
  currentRange: string;
  source: CurrentPkgSource;
  variantPattern?: string | null;
  componentId?: ComponentID;
  isAuto?: boolean;

  targetField: ManifestDependenciesKeysNames;
};

export type OutdatedPkg = CurrentPkg & {
  latestRange: string;
};

export type ComponentModelVersion = {
  name: string;
  version: string;
  componentId: ComponentID;
  lifecycleType: DependencyLifecycleType;
  isAuto: boolean;
};

/**
 * Get packages from root policy, variants, and component config files (component.json files).
 */
export function getAllPolicyPkgs({
  rootPolicy,
  variantPoliciesByPatterns,
  componentPolicies,
  componentModelVersions,
}: {
  rootPolicy: WorkspacePolicy;
  variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject>;
  componentPolicies: Array<{ componentId: ComponentID; policy: any }>;
  componentModelVersions: ComponentModelVersion[];
}): CurrentPkg[] {
  const pkgsFromPolicies = getPkgsFromRootPolicy(rootPolicy);
  const pkgsNamesFromPolicies = new Set(pkgsFromPolicies.map(({ name }) => name));
  return [
    ...pkgsFromPolicies,
    ...getPkgsFromVariants(variantPoliciesByPatterns),
    ...getPkgsFromComponents(componentPolicies),
    ...componentModelVersions
      .filter(({ name }) => !pkgsNamesFromPolicies.has(name))
      .map((componentDep) => ({
        name: componentDep.name,
        currentRange: componentDep.version,
        source: 'component-model' as const,
        isAuto: componentDep.isAuto,
        componentId: componentDep.componentId,
        targetField: KEY_NAME_BY_LIFECYCLE_TYPE[componentDep.lifecycleType] as ManifestDependenciesKeysNames,
      })),
  ];
}

function getPkgsFromRootPolicy(rootPolicy: WorkspacePolicy): CurrentPkg[] {
  return rootPolicy.entries.map((entry) => ({
    name: entry.dependencyId,
    currentRange: entry.value.version,
    source: 'rootPolicy',
    variantPattern: null as string | null,
    targetField: KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType] as ManifestDependenciesKeysNames,
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

function getPkgsFromComponents(
  componentPolicies: Array<{ componentId: ComponentID; policy: VariantPolicyConfigObject }>
): CurrentPkg[] {
  return componentPolicies
    .map(({ componentId, policy }) => {
      return readAllDependenciesFromPolicyObject({ source: 'component', componentId }, policy);
    })
    .flat();
}

function readAllDependenciesFromPolicyObject(
  context: Pick<CurrentPkg, 'source' | 'componentId' | 'variantPattern'>,
  policy: VariantPolicyConfigObject
): CurrentPkg[] {
  if (!policy) return [];
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
          currentRange:
            typeof currentRange === 'string' ? currentRange : (currentRange as VariantPolicyEntryValue).version,
          targetField,
        });
      }
    }
  }
  return pkgs;
}
