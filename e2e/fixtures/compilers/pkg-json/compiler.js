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
    const filePath = files[0].relative.replace(/\\/g, '/'); // linux format
    return { dists, packageJson: { foo: 'bar', dynamicValue: `{COMPONENT_DIST_PATH}/${filePath}` } };
}

module.exports = {
  compile
};
