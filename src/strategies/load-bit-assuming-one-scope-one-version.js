const glob = require('glob');
const path = require('path');
const resolveBit = require('../bit-resolver');

module.exports = (consumer, boxName, bitName) => {
  const directoryToLookIn = path.join(consumer.getBitsDir(), boxName, bitName);
  const optionalBits = glob.sync(path.join(directoryToLookIn, '*', '*'));
  if (optionalBits.length === 1) {
    return resolveBit(optionalBits[0]);
  }

  return null;
};
