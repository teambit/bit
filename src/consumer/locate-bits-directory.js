const path = require('path');
const { pathHasBitsDir, composeBitsDirPath } = require('./consumer-utils');

const locateBitsDirectory = (absPath) => {
  const buildPropogationPaths = () => {
    const paths = [];
    const pathParts = absPath.split(path.sep);

    pathParts.forEach((val, index) => {
      const part = pathParts.slice(0, index).join('/');
      if (!part) { return; }
      paths.push(part);
    });

    return paths.reverse();
  };

  if (pathHasBitsDir(absPath)) return composeBitsDirPath(absPath);
  const searchPaths = buildPropogationPaths();
  const resultPath = searchPaths.find(searchPath => pathHasBitsDir(searchPath));
  if (resultPath) composeBitsDirPath(resultPath);

  throw new Error('could not find a bit repo');
};

module.exports = locateBitsDirectory;
