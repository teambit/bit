import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';

/**
 * Utility function to check if a string looks like a package name vs component ID
 * @param id - The string to check
 * @returns true if it looks like a package name (starts with @)
 */
export function isLikelyPackageName(id: string): boolean {
  return id.startsWith('@');
}

/**
 * Standalone function to resolve component IDs from package names without workspace dependency.
 * This is specifically designed for use with remote operations when user is in a non-workspace directory.
 *
 * important: if you're in a workspace, use `workspace.resolveComponentIdFromPackageName` instead.
 *
 * @param packageName - The package name to resolve (e.g., "@scope/package.name")
 * @param dependencyResolver - The dependency resolver main instance for fetching package manifests
 * @returns Promise<ComponentID> - The resolved component ID without version
 */
export async function resolveComponentIdFromPackageName(
  packageName: string,
  dependencyResolver: { fetchFullPackageManifest: (name: string) => Promise<any> }
): Promise<ComponentID> {
  if (!packageName.startsWith('@')) {
    throw new BitError(
      `resolveComponentIdFromPackageName supports only packages that start with @, got ${packageName}`
    );
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
