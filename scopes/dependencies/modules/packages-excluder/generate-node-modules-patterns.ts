type generateNodeModulesPatternsOptions = {
  /**
   * An array of packages name to exclude in the regex.
   */
  packages: string[];
};

/**
 * A function that receive an array of packages name to catch in node modules and return a regex of it.
 * @param {string[]} packages - array of packages.
 * @returns {string} node modules catched packages regex.
 */
export function generateNodeModulesPatterns({ packages }: generateNodeModulesPatternsOptions): string {
  const negativeLookahead = packages.reduce((acc, curr) => {
    const yarnPattern = curr;
    const pnpmPattern = `.pnpm/registry.npmjs.org/${curr}.*`;
    // The new version of pnpm is not adding the registry as part of the path
    // so adding this as well to support it
    const newPnpmPattern = `.pnpm/${curr}.*`;

    if (acc) {
      return `${acc}|${yarnPattern}|${pnpmPattern}|${newPnpmPattern}`;
    }
    return `${yarnPattern}|${pnpmPattern}|${newPnpmPattern}`;
  }, '');
  const transformIgnorePatterns = `node_modules/(?!(${negativeLookahead})/)`;
  return transformIgnorePatterns;
}
