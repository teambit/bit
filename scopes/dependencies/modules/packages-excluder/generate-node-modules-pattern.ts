export enum PatternFormat {
  /**
   * Used in Jest `transformIgnorePatterns` options
   */
  JEST = 'jest',
  /**
   * Used in Webpack `snapshot.managedPaths` options
   */
  WEBPACK = 'webpack',
}

type GenerateNodeModulesPatternOptions<T> = {
  /**
   * An array of packages name to exclude in the regex.
   */
  packages?: string[];
  /**
   * The regex should exclude component packages.
   * A component package looks like `@org/scope.namespace.component-name`.
   */
  excludeComponents?: boolean;
  /**
   * The format to return the patterns.
   */
  format?: T;
};

const patternFormatMap = {
  [PatternFormat.JEST]: toJestPattern,
  [PatternFormat.WEBPACK]: toWebpackPattern,
};

type PatternFormatMap = typeof patternFormatMap;
type PatternFormatReturnType<T extends PatternFormat> = ReturnType<PatternFormatMap[T]>;

/**
 * A function that receives an array of packages names and returns a pattern (string) of a regex that matches any node_modules/package-name except the provided package-names.
 * @param {string[]} packages - array of packages.
 * @returns {string} node modules catched packages regex.
 */
export function generateNodeModulesPattern<T extends PatternFormat>(
  options: GenerateNodeModulesPatternOptions<T>
): PatternFormatReturnType<T> {
  const { packages = [], excludeComponents, format = PatternFormat.JEST } = options;
  const negativeLookaheadPatterns = packages.reduce((acc: string[], packageName) => {
    const yarnPattern = packageName.replace(/\//g, '[\\/]');
    const pnpmPackageName = packageName.replace(/\//g, '\\+');
    const pnpmPattern = `\\.pnpm[\\/](.*[+\\/])?${pnpmPackageName}.*`;
    return [...acc, yarnPattern, pnpmPattern];
  }, []);

  if (excludeComponents) {
    negativeLookaheadPatterns.push(
      '@[^/]+/([^/]+\\.)+[^/]+',
      '\\.pnpm/(.+[+/])?@[^+]+\\+([^+]+\\.)+[^+]+',
      '\\.pnpm/.+/node_modules/@[^/]+/([^/]+\\.)+[^/]+'
    );
  }

  return patternFormatMap[format](negativeLookaheadPatterns) as PatternFormatReturnType<T>;
}

function toJestPattern(patterns: string[]) {
  return `node_modules/(?!(${patterns.join('|')})/)`;
}

/**
 * Webpack managed paths evaluate absolutes paths to `package.json` files.
 * We need to generate a pattern that excludes the `package.json` files of the bit component packages.
 * Example:
 * - Component package: `@my-org/my-scope.components`
 * - Webpack path: `/Users/aUser/dev/bit-example/node_modules/@my-org/my-scope.components/package.json`
 * - RegExp to exclude this path from managed paths: `/^(.+?[\\/]node_modules[\\/](?!(@my-org[\\/]my-scope.components))(@.+?[\\/])?.+?)[\\/]/`
 */

function toWebpackPattern(patterns: string[]) {
  return patterns.map((pattern) => {
    return `^(.+?[\\/]node_modules[\\/](?!(${pattern}))(@.+?[\\/])?.+?)[\\/]`;
  });
}
