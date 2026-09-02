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
