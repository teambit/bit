const path = require('path');
const { TRANSPILERS_DIR } = require('../constants');
const loadLocalBitJson = require('../bit/load-local-bit-json');

const loadBitTranspiler = (bitPath) => {
  const getBitTranspilerName = bitJson => bitJson.transpiler;

  const transpilerName = getBitTranspilerName(loadLocalBitJson(bitPath));
  if (!transpilerName) {
    return null;
  }

  try {
    return require(path.join(TRANSPILERS_DIR, transpilerName)); // eslint-disable-line
  } catch (e) {
    throw new Error(`The transpiler "${transpilerName}" is not exists, please use "bit install ${transpilerName}" or change the transpiler name in the ".bit.json" file.`);
  }
};

module.exports = loadBitTranspiler;
