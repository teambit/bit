const path = require('path');
const { pathHasRepo, composeRepoPath } = require('./repo-utils');

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

  if (pathHasRepo(absPath)) return composeRepoPath(absPath);

  const searchPaths = buildPropogationPaths();
  const resultPath = searchPaths.find(searchPath => pathHasRepo(searchPath));
  if (resultPath) composeRepoPath(resultPath);

  throw new Error('could not find a bit repo');
};

module.exports = locateRepo;
