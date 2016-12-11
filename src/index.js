'use strict';
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const camelcase = require('camelcase');

const BIT_DIR_NAME = 'bits';

function composeRepoPath(p) {
  return path.join(p, BIT_DIR_NAME);
}

function pathHasRepo(p) {
  return fs.existsSync(composeRepoPath(p));
}

function locateRepo(absPath) {
  function buildPropogationPaths() {
    const paths = [];
    const pathParts = absPath.split(path.sep);
      
    pathParts.forEach((val, index) => {
      const part = pathParts.slice(0, index).join('/');
      if (!part) return;
      paths.push(part);
    });

    return paths.reverse();
  }

  if (pathHasRepo(absPath)) return absPath;
  const searchPaths = buildPropogationPaths();
  return searchPaths.find(searchPath => pathHasRepo(searchPath));     
}

function composeInlinePath(repoPath) {
  return path.join(repoPath, 'inline');
}

function mapBits(root) {
  const inlinePath = composeInlinePath(composeRepoPath(root));
  return glob
    .sync(`${inlinePath}/**/*.js`)
    .map(loadBit)
    .reduce(function(previousValue, currentValue, currentIndex) {
      previousValue[currentValue.name] = currentValue.ref;
      return previousValue;
    }, {});
}

function getName(path) {
  const parts = path.split('/');
  return camelcase(parts[parts.length - 2]);
}

function loadBit(bitPath) {
  return {
    name: getName(bitPath),
    ref: require(bitPath)
  };
}

function loadBits() {
  const repo = locateRepo(__dirname);
  if (!repo) return {};
  const bits = mapBits(repo);
  return bits;
}

module.exports = loadBits();
