/**
 * dummy compiler. do nothing. return the same source files as dists
 */
const path = require('path');

function compile(files, distPath) {
  return files
    .map((file) => {
      const distFile = file.clone();
      distFile.base = distPath;
      distFile.path = path.join(distPath, file.relative);
      return distFile;
    });
}

module.exports = {
  compile
};
