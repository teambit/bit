import 'expose-loader';

export type ExposedEntry = {
  path: string;
  globalName: string;
};

export type ExposedEntries = ExposedEntry[];

export type GenerateExposeLoadersOptions = {
  loaderPath?: string;
};

/**
 * Generate a list of exposed entries rules
 * @param exposedEntries
 * @param options
 * @returns
 */
export function generateExposeLoaders(
  exposedEntries: ExposedEntries,
  options: GenerateExposeLoadersOptions = {}
): Array<object> {
  const loaderPath = options.loaderPath || require.resolve('expose-loader');
  const rules = exposedEntries.map((entry) => {
    return {
      test: entry.path,
      loader: loaderPath,
      options: {
        exposes: [entry.globalName],
      },
    };
  });
  return rules;
}
