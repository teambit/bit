const glob = require('glob');
const path = require('path');
const resolveBit = require('../bit-resolver');

const ArrayMax = arr => Math.max.apply(Math, arr); // eslint-disable-line

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const optionalScopes = glob.sync(path.join(directoryToLookIn, '*'));
  if (optionalScopes.length === 1) {
    const optionalBits = glob.sync(path.join(optionalScopes[0], '*'));
    if (optionalBits.length < 1) { return null; }
    const latestVersion = String(ArrayMax(optionalBits.map(p => parseInt(path.basename(p), 10))));
    if (latestVersion === 'NaN') { return null; }
    const latestBit = path.join(optionalScopes[0], latestVersion);
    return resolveBit(latestBit);
  }

  return null;
};
