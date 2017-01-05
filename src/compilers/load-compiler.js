const path = require('path');
const {
  ENVIRONEMT_DIRNAME,
  LOCAL_SCOPE_DIRNAME } = require('../constants');
const resolveBit = require('../bit-resolver');
const parseFullId = require('../bit-id/parse-bit-full-id');

const loadBitCompiler = (compilerId, consumer) => {
  if (!compilerId) {
    return null;
  }

  const { scope, box, name, version } = parseFullId(compilerId);
  const compilerBitPath = path.join(box, name, scope, version);
  const compilerBitFullPath =
    path.join(consumer.getPath(), LOCAL_SCOPE_DIRNAME, ENVIRONEMT_DIRNAME, compilerBitPath);

  try {
    return resolveBit(compilerBitFullPath); // eslint-disable-line
  } catch (e) {
    throw new Error(`The compiler ${compilerId} does not exist, please use "bit import -e ${compilerId}" or change the compiler name in the "bit.json" file.`);
  }
};

module.exports = loadBitCompiler;
