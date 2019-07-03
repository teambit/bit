/**
 * this compiler generates an additional dist main-file which is different than the source main-file
 */
const path = require('path');

function compile(files, distPath) {
  const dists = files
    .map((file) => {
      const distFile = file.clone();
      distFile.base = distPath;
      distFile.path = path.join(distPath, file.relative);
      return distFile;
    });
    return { dists, packageJson: { foo: 'bar' } };
}

module.exports = {
  compile
};
