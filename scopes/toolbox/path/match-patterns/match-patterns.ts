import minimatch from 'minimatch';

/**
 * Checks if a string matches a list of patterns.
 */
export function matchPatterns(filePath: string, includePatterns: string[], excludePatterns: string[]): boolean {
  const included = includePatterns.some((pattern) => {
    return minimatch(filePath, pattern);
  });
  const excluded = excludePatterns.every((pattern) => {
    return minimatch(filePath, pattern);
  });

  return included && excluded;
}

/**
 * Given a list of patterns, returns include and exclude patterns.
 * Exclude patterns are prefixed with !.
 */
export function splitPatterns(patterns: string[]): { includePatterns: string[]; excludePatterns: string[] } {
  return {
    includePatterns: patterns.filter((pattern) => !pattern.startsWith('!')),
    excludePatterns: patterns.filter((pattern) => pattern.startsWith('!')),
  };
}
