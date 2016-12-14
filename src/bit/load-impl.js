const path = require('path');
const fs = require('fs');
const loadBitTranspiler = require('../transpilers/load-transpiler');
const requireFromString = require('require-from-string');

const loadImpl = (bitPath) => {
  try {
    const implPath = path.join(bitPath, 'impl.js');
    const implContent = require(implPath) // eslint-disable-line
    return implContent;
  } catch (e) {
    throw e;
  }
};

const readRawImpl = (implPath) => {
  try {
    const rawContents = fs.readFileSync(implPath, 'utf8');
    return rawContents;
  } catch (e) {
    throw e;
  }
};

const getBitImpl = (bitPath) => {
  const transpiler = loadBitTranspiler(bitPath);
  const implPath = path.join(bitPath, 'impl.js');

  if (!transpiler) return loadImpl(bitPath);

  const rawImpl = readRawImpl(implPath);
  return requireFromString(transpiler.transpile(rawImpl).code, implPath); //eslint-disable-line
};

module.exports = getBitImpl;
