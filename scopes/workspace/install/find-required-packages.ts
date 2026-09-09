/**
 * the packages out of `packageNames` that the given sources require.
 *
 * matching is done on the quoted specifier - the package name either closed by the quote or
 * followed by a sub-path - so a require of `@teambit/react-native` is not counted as a require of
 * `@teambit/react`. a package name that happens to appear in a string of its own (e.g. an error
 * message) is the only kind of false positive left, which is harmless here: the answer only decides
 * whether a package is added to the install policy.
 */
export function findRequiredPackages(sources: string[], packageNames: string[]): string[] {
  return packageNames.filter((packageName) => {
    const specifiers = [`'${packageName}'`, `"${packageName}"`, `'${packageName}/`, `"${packageName}/`];
    return sources.some((source) => specifiers.some((specifier) => source.includes(specifier)));
  });
}

type PackageJsonDependencies = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * the packages out of `packageNames` that the given sources require while the package.json of the
 * package they belong to does not declare them - the definition of a phantom dependency.
 *
 * a declared dependency must not be reported: the package manager installs it as part of the
 * package, so adding it to the workspace policy is at best redundant, and at worst breaks the
 * install - a root dependency on a package the lockfile so far holds only as a transitive one is
 * rejected by pnpm's hoisted linker ("Broken lockfile: missing snapshot").
 */
export function findPhantomPackages(
  sources: string[],
  packageNames: string[],
  packageJson: PackageJsonDependencies
): string[] {
  const declared = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
  ]);
  return findRequiredPackages(sources, packageNames).filter((packageName) => !declared.has(packageName));
}
