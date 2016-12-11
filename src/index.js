'use strict';
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const camelcase = require('camelcase');
const TRANSPILERS_DIR = require('./constants').TRANSPILERS_DIR;

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
    .sync(`${inlinePath}/*`) // @TODO - build path dynamically according to env(use path module) 
    .map(loadBit)
    .reduce(function (previousValue, currentValue) {
      if (!currentValue.name) return previousValue;
      previousValue[currentValue.name] = currentValue.ref;
      return previousValue;
    }, {});
}

function getName(bitPath) {
  const parts = bitPath.split('/');
  return camelcase(parts[parts.length - 1]);
}

function getLocalBitJson(bitPath) {
  const bitJsonPath = path.join(bitPath, '.bit.json');
  return JSON.parse(fs.readFileSync(bitJsonPath, 'utf8'));
}

function getBitTranspiler(bitPath) {
  function getBitTranspilerName(bitJson) {
    return bitJson.transpiler;
  }

  const transpilerName = getBitTranspilerName(getLocalBitJson(bitPath));
  try {
    return require(path.join(TRANSPILERS_DIR, transpilerName));
  } catch (e) {
    throw (new Error(`The transpiler ${transpilerName} is not exists, please use "bit install ${transpilerName}".`));
  }
}

function getBitImpl(bitPath) {
  const transpiler = getBitTranspiler(bitPath);
  const implPath = path.join(bitPath, 'impl.js');
  const implContent = require(implPath);
  const transpiled = transpiler.transpile(implContent);
  return transpiled.code;
}

function loadBit(bitPath) {
  try {
    return {
      name: getName(bitPath),
      ref: getBitImpl(bitPath)
    };
  } catch (e) {
    console.error(e);
    return {};
  }
}

function loadBits() {
  const repo = locateRepo(process.cwd());
  if (!repo) return {};
  const bits = mapBits(repo);
  return bits;
}

module.exports = loadBits();
