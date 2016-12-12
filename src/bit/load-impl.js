const path = require('path');
const fs = require('fs');
const loadBitTranspiler = require('../transpilers/load-transpiler');

const loadImpl = (bitPath) => {
  try {
    const implPath = path.join(bitPath, 'impl.js');
    const implContent = require(implPath); // eslint-disable-line
    return implContent;
  } catch (e) {
    throw e;
  }
};

const readRawImpl = (bitPath) => {
  try {
    const implPath = path.join(bitPath, 'impl.js');
    const rawContents = fs.readFileSync(implPath, 'utf8');
    return rawContents;
  } catch (e) {
    throw e;
  }
};

const getBitImpl = (bitPath) => {
  const transpiler = loadBitTranspiler(bitPath);
  if (!transpiler) return loadImpl(bitPath);

  const rawImpl = readRawImpl(bitPath);
  return eval(transpiler.transpile(rawImpl).code); //eslint-disable-line
};

module.exports = getBitImpl;
