const path = require('path');
const { pathHasRepo } = require('./repo-utils');

const locateRepo = (absPath) => {
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

  if (pathHasRepo(absPath)) return absPath;
  const searchPaths = buildPropogationPaths();
  return searchPaths.find(searchPath => pathHasRepo(searchPath));
};

module.exports = locateRepo;
