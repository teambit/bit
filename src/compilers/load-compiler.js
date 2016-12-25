const path = require('path');
const { COMPILERS_DIR } = require('../constants');

const loadBitCompiler = (compilerName) => {
  if (!compilerName) {
    return null;
  }

  try {
    return require(path.join(COMPILERS_DIR, compilerName)); // eslint-disable-line
  } catch (e) {
    throw new Error(`The compiler "${compilerName}" is not exists, please use "bit install ${compilerName}" or change the compiler name in the ".bit.json" file.`);
  }
};

module.exports = loadBitCompiler;
