/**
 * this compiler is written for the following test:
 * 'export a component where the require id in the dist files are without a scope-name'
 * DO NOT change anything here unless you understand how it affects the test above.
 */
const path = require('path');

function compile(files, distPath) {
  return files
    .map((file) => {
      const distFile = file.clone();
      distFile.base = distPath;
      distFile.path = path.join(distPath, file.relative);
      distFile.contents = Buffer.from('require("@bit/bar-dep"); require("@bit/bar-non-exist"); require("@bit/bar-dep/internal-path");');
      return distFile;
    });
}

module.exports = {
  compile
};
