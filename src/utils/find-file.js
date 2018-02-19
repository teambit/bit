import fs from 'fs-extra';
import parents from 'parents';
/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 *
 */
function searchFileRecursively(dir, fileToFind) {
  const parentsArr = parents(dir);
  parentsArr.forEach((parent) => {
    const config = `${parent}/${fileToFind}`;
    try {
      if (fs.lstatSync(config).isFile()) {
        return config;
      }
      return null;
    } catch (e) {
      console.log(`search file recursively failed with the following error: ${e}`); // eslint-disable-line no-console
      return null;
    }
  });
  return null;
}

/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 *
 */
export default function findFile(dir, fileToFind) {
  const pathToFile = searchFileRecursively(dir, fileToFind);
  return pathToFile;
}
