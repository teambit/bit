const path = require('path');

const locateRecursively = (isDirectoryFunction, SpecificError) => (absPath) => {
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

  if (isDirectoryFunction(absPath)) return absPath;
  const resultPath = buildPropogationPaths().find(searchPath => isDirectoryFunction(searchPath));

  if (resultPath) return resultPath;
  throw SpecificError ? new SpecificError(absPath) : new Error(absPath);
};

module.exports = locateRecursively;
