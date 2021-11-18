import { ManifestDependenciesKeysNames } from './manifest';
import { WorkspacePolicy } from './policy';

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

type ResolveFunction = (range: string) => Promise<string | null>;

/**
 * Gets outdated packages from root policy, variants, and component config files (component.json files).
 */
export function getOutdatedWorkspacePkgs({
  rootPolicy,
  variantPoliciesByPatterns,
  resolve,
  componentPoliciesById,
}: {
  rootPolicy: WorkspacePolicy;
  variantPoliciesByPatterns: Record<string, any>;
  resolve: ResolveFunction;
  componentPoliciesById: Record<string, any>;
}): Promise<OutdatedPkg[]> {
  const allPkgs = [
    ...getPkgsFromRootPolicy(rootPolicy),
    ...getPkgsFromVariants(variantPoliciesByPatterns),
    ...getPkgsFromComponents(componentPoliciesById),
  ];
  return getOutdatedPkgs(resolve, allPkgs);
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

function getPkgsFromVariants(variantPoliciesByPatterns: Record<string, any>): CurrentPkg[] {
  return Object.entries(variantPoliciesByPatterns)
    .filter(([, variant]) => variant != null)
    .map(([variantPattern, variant]) => {
      return readAllDependenciesFromPolicyObject({ source: 'variants', variantPattern }, variant);
    })
    .flat();
}

function getPkgsFromComponents(componentPoliciesById: Record<string, any>): CurrentPkg[] {
  return Object.entries(componentPoliciesById)
    .map(([componentId, policy]) => {
      return readAllDependenciesFromPolicyObject({ source: 'component', componentId }, policy);
    })
    .flat();
}

function readAllDependenciesFromPolicyObject(
  context: Pick<CurrentPkg, 'source' | 'componentId' | 'variantPattern'>,
  policy: Record<ManifestDependenciesKeysNames, Record<string, string>>
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
          currentRange: currentRange as string,
          targetField,
        });
      }
    }
  }
  return pkgs;
}

function repeatPrefix(originalSpec: string, newVersion: string): string {
  switch (originalSpec[0]) {
    case '~':
    case '^':
      return `${originalSpec[0]}${newVersion}`;
    default:
      return newVersion;
  }
}

async function getOutdatedPkgs<T>(
  resolve: ResolveFunction,
  pkgs: Array<{ name: string; currentRange: string } & T>
): Promise<Array<{ name: string; currentRange: string; latestRange: string } & T>> {
  return (
    await Promise.all(
      pkgs.map(async (pkg) => {
        const latestVersion = await resolve(`${pkg.name}@latest`);
        return {
          ...pkg,
          latestRange: latestVersion ? repeatPrefix(pkg.currentRange, latestVersion) : null,
        } as any;
      })
    )
  ).filter(({ latestRange, currentRange }) => latestRange != null && latestRange !== currentRange);
}
