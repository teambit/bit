const path = require('path');
const { TRANSPILERS_DIR } = require('../constants');

const loadBitTranspiler = (transpilerName) => {
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
