// @flow

/**
 * code template for writing link files.
 * when custom module resolution was originally used by the author, we create link-files on
 * node_modules directory upon importing the component. this way, when the code is looking for a
 * relative file with a module path (e.g. `require ('@/is-string')`), it'll find it.
 *
 * Now, here is the problem, when the component is installed by npm/yarn, Bit can't create these
 * link files. That's where this post install script comes it. It creates the missing link files
 */
export default (linkFilesStr: string): string => {
  return `var fs = require('fs');
var path = require('path');

var linkFiles = ${linkFilesStr};

function ensureDir(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDir(dirname);
  fs.mkdirSync(dirname);
}

Object.keys(linkFiles).map(function (linkFile) {
  if (!fs.existsSync(linkFile)) {
    ensureDir(linkFile);
    fs.writeFileSync(linkFile, linkFiles[linkFile]);
  }
});
`;
};
