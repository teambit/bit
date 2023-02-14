type generateNodeModulesPatternOptions = {
  /**
   * An array of packages name to exclude in the regex.
   */
  packages?: string[];
  /**
   * The regex should exclude component packages.
   * A component package looks like `@org/scope.namespace.component-name`.
   */
  excludeComponents?: boolean;
};

/**
 * A function that receives an array of packages names and returns a pattern (string) of a regex that matches any node_modules/package-name except the provided package-names.
 * @param {string[]} packages - array of packages.
 * @returns {string} node modules catched packages regex.
 */
export function generateNodeModulesPattern({
  packages = [],
  excludeComponents,
}: generateNodeModulesPatternOptions): string {
  const negativeLookaheadPatterns = packages.reduce((acc: string[], curr) => {
    const yarnPattern = curr;
    const pnpmCurr = curr.replace(/\//g, '\\+');
    const pnpmPattern = `\\.pnpm/(.*[+/])?${pnpmCurr}.*`;
    return [...acc, yarnPattern, pnpmPattern];
  }, []);
  if (excludeComponents) {
    negativeLookaheadPatterns.push(
      '@[^/]+/([^/]+\\.)+[^/]+',
      '\\.pnpm/(.+[+/])?@[^+]+\\+([^+]+\\.)+[^+]+',
      '\\.pnpm/.+/node_modules/@[^/]+/([^/]+\\.)+[^/]+'
    );
  }
  const transformIgnorePattern = `node_modules/(?!(${negativeLookaheadPatterns.join('|')})/)`;
  return transformIgnorePattern;
}
