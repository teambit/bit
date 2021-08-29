type NodeModulesExcludePackagesOptions = {
  /**
   * An array of packages name to exclude in the regex.
   */
  packages: string[];
};

export function nodeModulesExcludePackages({ packages }: NodeModulesExcludePackagesOptions): string {
  const negativeLookahead = packages.reduce((acc, curr) => {
    const yarnPattern = curr;
    const pnpmPattern = `.pnpm/registry.npmjs.org/${curr}.*`;
    // The new version of pnpm is not adding the registry as part of the path
    // so adding this as well to support it
    const newPnpmPattern = `.pnpm/${curr}.*`;

    if (acc) {
      return `${acc}|${yarnPattern}|${pnpmPattern}|${newPnpmPattern}`;
    }
    return `${yarnPattern}|${pnpmPattern}`;
  }, '');
  const transformIgnorePatterns = `node_modules/(?!(${negativeLookahead})/)`;
  return transformIgnorePatterns;
}
