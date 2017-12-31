import fs from 'fs-extra';
import parents from 'parents';
import path from 'path';
/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 *
 */
function searchFileRecursively(dir, fileToFind) {
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
export default function findFile(dir, fileToFind) {
  const pathToFile = searchFileRecursively(dir, fileToFind);
  return pathToFile;
}
