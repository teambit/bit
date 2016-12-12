const path = require('path');
const glob = require('glob');
const composeRepoPath = require('./repo/repo-utils').composeRepoPath;
const locateRepo = require('./repo/locate-repo');
const loadBit = require('./bit/load-bit');

const composeInlinePath = repoPath => path.join(repoPath, 'inline');

const mapBits = (root) => {
  const inlinePath = composeInlinePath(composeRepoPath(root));
  return glob
    .sync(path.join(inlinePath, '*'))
    .map(loadBit)
    .reduce((previousValue, currentValue) => {
      if (!currentValue.name) { return previousValue; }
      previousValue[currentValue.name] = currentValue.ref; // eslint-disable-line
      return previousValue;
    }, {});
};

const loadBits = () => {
  const repo = locateRepo(process.cwd());
  if (!repo) return {};
  const bits = mapBits(repo);
  return bits;
};

module.exports = loadBits();
