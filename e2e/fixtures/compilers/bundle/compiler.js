/**
 * generate one file: bundle.js
 */
const path = require('path');

function compile(files, distPath) {
  const distFile = files[0].clone();
  distFile.base = distPath;
  distFile.path = path.join(distPath, 'bundle.js');
  return [distFile];
}

module.exports = {
  compile
};
