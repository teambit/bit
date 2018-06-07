// @flow

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
