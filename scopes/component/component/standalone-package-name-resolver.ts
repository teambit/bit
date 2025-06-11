import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { DependencyResolverMain } from '@teambit/dependency-resolver';

/**
 * Standalone function to resolve component IDs from package names without workspace dependency.
 * This is specifically designed for use with `bit show --remote` command when user is in a non-workspace directory.
 */
export async function resolveComponentIdFromPackageNameStandalone(
  packageName: string,
  dependencyResolver: DependencyResolverMain,
): Promise<ComponentID> {
  if (!packageName.startsWith('@')) {
    throw new BitError(`resolveComponentIdFromPackageNameStandalone supports only packages that start with @, got ${packageName}`);
  }

  const errMsgPrefix = `unable to resolve a component-id from the package-name ${packageName}, `;

  try {
    // Try to fetch the full package manifest from the registry
    const manifest = await dependencyResolver.fetchFullPackageManifest(packageName);

    if (!manifest) {
      throw new BitError(`${errMsgPrefix}unable to fetch package manifest from registry`);
    }

    if (!('componentId' in manifest)) {
      throw new BitError(
        `${errMsgPrefix}the package.json of version "${manifest.version}" has no componentId field, it's probably not a component`
      );
    }

    const componentId = manifest.componentId as ComponentIdObj;
    return ComponentID.fromObject(componentId).changeVersion(undefined);
  } catch (error: any) {
    if (error instanceof BitError) {
      throw error;
    }
    throw new BitError(`${errMsgPrefix}failed to resolve from registry: ${error.message}`);
  }
}

/**
 * Utility function to check if a string looks like a package name vs component ID
 * @param id - The string to check
 * @returns true if it looks like a package name (starts with @)
 */
export function isLikelyPackageName(id: string): boolean {
  return id.startsWith('@');
}
