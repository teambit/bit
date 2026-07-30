import packageNameValidate from 'validate-npm-package-name';

/**
 * whether the given name is a package name that can be installed from a registry.
 * names such as "events" or "string_decoder" collide with Node core module names, so they are not
 * valid for publishing *new* packages, but they exist on npm and are installable, hence the check
 * against `validForOldPackages` and not `validForNewPackages`.
 */
export function isValidPackageName(pkgName: string): boolean {
  return packageNameValidate(pkgName).validForOldPackages;
}

/**
 * extract the package name out of an install argument, stripping the version/tag suffix if exists.
 * e.g. "lodash@4.17.21" => "lodash", "@types/node@20" => "@types/node".
 */
export function extractPackageName(packageString: string): string {
  if (!packageString) return '';

  // Handle https and git protocols. We don't allow "file" protocol here. It won't work for the consumer.
  const allowedPrefixes = ['https://', 'git:', 'git+ssh://', 'git+https://'];
  if (allowedPrefixes.some((prefix) => packageString.startsWith(prefix))) {
    return packageString;
  }

  // If it's a scoped package
  if (packageString.startsWith('@')) {
    // Find the second '@' (first is for scope, second is for version/tag)
    const atIndex = packageString.indexOf('@', 1);
    if (atIndex === -1) return packageString;
    const possibleVersion = packageString.slice(atIndex + 1);
    // If the part after the second '@' contains a slash, it's not a version/tag
    if (possibleVersion.includes('/')) return packageString;
    return packageString.slice(0, atIndex);
  }

  // For unscoped packages, split at the last '@'
  const lastAtIndex = packageString.lastIndexOf('@');
  if (lastAtIndex <= 0) return packageString;
  return packageString.slice(0, lastAtIndex);
}
