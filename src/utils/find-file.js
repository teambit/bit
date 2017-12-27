import fs from 'fs-extra';
import parents from 'parents';
import path from 'path';
/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 *
 */
function findPath(dir, fileToFind) {
  const parentsArr = parents(dir);
  let i;
  for (i = 0; i < parentsArr.length; i++) {
    const config = `${parentsArr[i]}/${fileToFind}`;
    try {
      if (fs.lstatSync(config).isFile()) {
        return config;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 *
 */
export default function findPackage(dir, fileToFind) {
  const pathToConfig = findPath(dir, fileToFind);
  const configJSON = null;
  if (pathToConfig !== null) return pathToConfig;
  if (configJSON) {
    configJSON.paths = {
      relative: path.relative(dir, pathToConfig),
      absolute: pathToConfig
    };
  } else if (configJSON !== null) {
    delete configJSON.paths;
  }

  return configJSON;
}
