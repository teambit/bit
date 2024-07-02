import normalize from 'normalize-path';
import { TsConfigJson } from 'get-tsconfig';
import { flatten } from 'lodash';
import { dirname, relative } from 'path';

/**
 * It takes a tsconfig.json file, a list of component directories, and returns a new tsconfig.json file with the include
 * and exclude properties expanded to include all the component directories
 * @param {string} tsConfigPath - The path to the tsconfig.json file.
 * @param {TsConfigJson} tsConfig - The tsconfig.json file that we're going to modify.
 * @param {string[]} compDirs - An array of paths to the component directories.
 * @returns the tsConfig object.
 */

export function expandIncludeExclude(
  tsConfigPath: string,
  tsConfig: TsConfigJson,
  compDirs: string[],
  globalTypesDir?: string
) {
  const tsConfigDir = dirname(tsConfigPath);

  if (tsConfig.include) {
    tsConfig.include = flatten(
      tsConfig.include.map((includedPath) => {
        return compDirs.map((compDir) => {
          const compDirRelative = normalize(relative(tsConfigDir, compDir));
          return `${compDirRelative}/${includedPath}`;
        });
      })
    );
  }
  if (globalTypesDir) {
    tsConfig.include = tsConfig.include || [];
    tsConfig.include.push(`./${globalTypesDir}/**/*`);
  }
  if (tsConfig.exclude) {
    tsConfig.exclude = flatten(
      tsConfig.exclude.map((excludedPath) => {
        return compDirs.map((compDir) => {
          const compDirRelative = relative(tsConfigDir, compDir);
          return `${compDirRelative}/${excludedPath}`;
        });
      })
    );
  }
  return tsConfig;
}
