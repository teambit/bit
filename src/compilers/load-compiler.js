const path = require('path');
const {
  ENVIRONEMT_DIRNAME,
  LOCAL_SCOPE_DIRNAME,
  VERSION_DELIMITER,
  ID_DELIMITER,
  DEFAULT_BOXNAME } = require('../constants');
const resolveBit = require('./bit-resolver');

const parseCompilerId = (id) => {
  const [withoutVersion, version] = id.split(VERSION_DELIMITER);
  if (!withoutVersion || !version) { throw new Error(`invalid compiler id ${id}`); }
  const splitted = withoutVersion.split(ID_DELIMITER);
  let scope;
  let box = DEFAULT_BOXNAME;
  let name;

  if (splitted.length === 3) {
    scope = splitted[0].replace('@', '');
    box = splitted[1];
    name = splitted[2];
  } else if (splitted.length === 2) {
    scope = splitted[0].replace('@', '');
    name = splitted[1];
  } else { throw new Error(`invalid compiler id ${id}`); }

  return { scope, box, name, version };
};

const loadBitCompiler = (compilerId, consumer) => {
  if (!compilerId) {
    return null;
  }

  const { scope, box, name, version } = parseCompilerId(compilerId);
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
