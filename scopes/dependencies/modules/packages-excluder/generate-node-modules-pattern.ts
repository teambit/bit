type generateNodeModulesPatternOptions = {
  /**
   * An array of packages name to exclude in the regex.
   */
  packages: string[];
};

/**
 * A function that receives an array of packages names and returns a pattern (string) of a regex that matches any node_modules/package-name except the provided package-names.
 * @param {string[]} packages - array of packages.
 * @returns {string} node modules catched packages regex.
 */
export function generateNodeModulesPattern({ packages }: generateNodeModulesPatternOptions): string {
  const negativeLookahead = packages.reduce((acc, curr) => {
    const yarnPattern = curr;
    const pnpmPattern = `.pnpm/.*[+/]${curr}.*`;
    // The new version of pnpm is not adding the registry as part of the path
    // so adding this as well to support it
    const newPnpmPattern = `.pnpm/${curr}.*`;

    if (acc) {
      return `${acc}|${yarnPattern}|${pnpmPattern}|${newPnpmPattern}`;
    }
    return `${yarnPattern}|${pnpmPattern}|${newPnpmPattern}`;
  }, '');
  const transformIgnorePattern = `node_modules/(?!(${negativeLookahead})/)`;
  return transformIgnorePattern;
}
