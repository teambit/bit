export type GenerateExternalsOptions = {
  transformName?: (dependencyName: string) => string;
};

/**
 * Get's a list of dependencies and create an externals object out of them
 * @param dependencies
 * @param options
 * @returns
 */
export function generateExternals(
  dependencies: string[],
  options: GenerateExternalsOptions = {}
): Record<string, string> {
  const externals = dependencies.reduce((acc, dependency) => {
    acc[dependency] = options.transformName ? options.transformName(dependency) : dependency;
    return acc;
  }, {});
  return externals;
}
